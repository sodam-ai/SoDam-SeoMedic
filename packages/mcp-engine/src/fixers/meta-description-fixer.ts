import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import fs from "node:fs";
import { assertFieldAbsent, AddSafeViolationError } from "./add-safe-guard.js";

const MAX_DESCRIPTION_LENGTH = 155;

export interface MetaDescriptionFixPlan {
  /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, 변수 참조, 스프레드,
   * 복사할 본문 문단 부재, 'use client' 등) — report_only로 폴백해야 한다. */
  applicable: boolean;
  reason: string;
  originalText?: string;
  updatedText?: string;
}

/**
 * title-fixer.ts의 findStaticMetadataObject/hasSpreadElement/hasUseClientDirective와 동일 로직을
 * 의도적으로 복제한다(이 저장소의 기존 관례 — 각 fixer 파일을 독립적으로 유지해 다른 fixer의 검증된
 * 동작을 절대 건드리지 않는다. 복제 비용은 ~20줄씩).
 */
function hasSpreadElement(objLit: ObjectLiteralExpression): boolean {
  return objLit.getProperties().some((p) => p.getKind() === SyntaxKind.SpreadAssignment);
}

function findStaticMetadataObject(filePath: string): { project: Project; objLit: ObjectLiteralExpression } | null {
  if (!fs.existsSync(filePath)) return null;

  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);

  const generateMetadataFn = sourceFile.getFunctions().find((fn) => fn.isExported() && fn.getName() === "generateMetadata");
  if (generateMetadataFn) return null;

  const metadataDecl = sourceFile.getVariableDeclaration("metadata");
  if (!metadataDecl) return null;

  const varStatement = metadataDecl.getVariableStatement();
  if (!varStatement?.isExported()) return null;

  const objLit = metadataDecl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (!objLit) return null;

  if (hasSpreadElement(objLit)) return null;

  return { project, objLit };
}

function hasUseClientDirective(sourceFile: SourceFile): boolean {
  const first = sourceFile.getStatements()[0];
  if (!first || first.getKind() !== SyntaxKind.ExpressionStatement) return false;
  const expr = first.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
  if (expr.getKind() !== SyntaxKind.StringLiteral) return false;
  return expr.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue() === "use client";
}

/**
 * 155자(검색결과 스니펫 관례상 상한) 넘으면 단어 경계에서 자르고 "..."을 붙인다. 짧으면 원문 그대로
 * (말줄임표 없음) — 잘리지 않은 값까지 변형하면 "값 발명 없음" 원칙에서 불필요하게 멀어진다.
 */
function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const safeCut = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut}...`;
}

/**
 * metadata export도 generateMetadata 함수도 파일에 전혀 없을 때, description 하나만 담은 새
 * `export const metadata = {...}` 문을 처음부터 삽입한다(title-fixer.ts의 tryInsertNewMetadataExport와
 * 동일 패턴). 반환값이 null이면 "이 케이스가 아니다"라는 뜻으로, 호출부가 기존 report_only 경로로
 * 폴백한다.
 */
function tryInsertNewMetadataExport(filePath: string, description: string | null): MetaDescriptionFixPlan | null {
  if (!fs.existsSync(filePath)) return null;

  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);

  const generateMetadataFn = sourceFile.getFunctions().find((fn) => fn.isExported() && fn.getName() === "generateMetadata");
  if (generateMetadataFn) return null;

  const metadataDecl = sourceFile.getVariableDeclaration("metadata");
  if (metadataDecl) return null;

  if (hasUseClientDirective(sourceFile)) {
    return {
      applicable: false,
      reason: "'use client' 컴포넌트는 metadata export를 가질 수 없습니다(Next.js 제약) — 제안만 제공합니다",
    };
  }

  if (!description) {
    return { applicable: false, reason: "복사할 원본 값이 없습니다(<main> 안의 본문 문단 없음) — 제안만 제공합니다" };
  }

  const truncated = truncateAtWordBoundary(description, MAX_DESCRIPTION_LENGTH);
  const originalText = sourceFile.getFullText();

  const imports = sourceFile.getImportDeclarations();
  const lastImport = imports[imports.length - 1];
  const insertIndex = lastImport ? lastImport.getChildIndex() + 1 : 0;
  sourceFile.insertStatements(insertIndex, `\nexport const metadata = {\n  description: ${JSON.stringify(truncated)},\n};\n`);

  const updatedText = sourceFile.getFullText();
  return {
    applicable: true,
    reason: "metadata export가 없어 description만 담은 새 export를 추가함(<main> 안 첫 문단을 그대로 복사, 155자 초과 시 단어 경계에서 자름)",
    originalText,
    updatedText,
  };
}

/**
 * description이 raw/rendered 어디에도 전혀 없을 때(R-META-DESCRIPTION-MISSING), <main> 태그 안의
 * 첫 문단(<p>) 텍스트를 그대로 복사해 metadata.description에 채운다. <main>이 없거나 그 안에 문단이
 * 없으면(복사할 원본이 없음) report_only로 폴백한다 — title-fixer.ts와 달리 "본문 어디를 발췌할지"
 * 자체가 판단이 개입될 수밖에 없는 문제라, HTML5가 명시적으로 "본문 전용"으로 보장하는 <main> 밖은
 * 절대 보지 않는다(nav/footer 오염 방지, 2026-09-01 설계 결정).
 */
export function planMetaDescriptionFix(filePath: string, mainFirstParagraphText: string | null): MetaDescriptionFixPlan {
  const found = findStaticMetadataObject(filePath);
  if (!found) {
    const inserted = tryInsertNewMetadataExport(filePath, mainFirstParagraphText);
    if (inserted) return inserted;

    return {
      applicable: false,
      reason:
        "metadata가 정적 object literal(export const metadata = {...}) 형태가 아닙니다" +
        "(generateMetadata 동적 함수·metadata 부재·변수 참조·스프레드 중 하나) — 제안만 제공합니다",
    };
  }

  if (!mainFirstParagraphText) {
    return { applicable: false, reason: "복사할 원본 값이 없습니다(<main> 안의 본문 문단 없음) — 제안만 제공합니다" };
  }

  const { objLit } = found;
  const originalText = objLit.getSourceFile().getFullText();

  try {
    assertFieldAbsent(objLit, "description");
  } catch (err) {
    if (!(err instanceof AddSafeViolationError)) throw err;
    // 이미 description 필드가 존재(빈 문자열 등) — 값과 무관하게 절대 덮어쓰지 않는다(멱등, fail-closed).
    return { applicable: true, reason: "description이 이미 존재해 변경하지 않습니다(멱등)", originalText, updatedText: originalText };
  }

  const truncated = truncateAtWordBoundary(mainFirstParagraphText, MAX_DESCRIPTION_LENGTH);
  objLit.addPropertyAssignment({ name: "description", initializer: JSON.stringify(truncated) });

  const updatedText = objLit.getSourceFile().getFullText();
  return {
    applicable: true,
    reason: "description 추가(<main> 안 첫 문단을 그대로 복사, 155자 초과 시 단어 경계에서 자름)",
    originalText,
    updatedText,
  };
}

/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeMetaDescriptionFix(filePath: string, updatedText: string): void {
  fs.writeFileSync(filePath, updatedText, "utf-8");
}
