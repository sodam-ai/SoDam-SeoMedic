import { Project, SyntaxKind, type ObjectLiteralExpression } from "ts-morph";
import fs from "node:fs";
import { assertFieldAbsent, AddSafeViolationError } from "./add-safe-guard.js";

export interface OgFixPlan {
  /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, metadata 부재, 변수 참조,
   * 스프레드 등) — report_only로 폴백해야 한다. */
  applicable: boolean;
  reason: string;
  originalText?: string;
  updatedText?: string;
  /** 실제로 추가된 필드(디스플레이/diff 렌더용). 멱등 no-op이면 빈 배열. */
  added?: Array<{ field: "title" | "url"; value: string }>;
}

/**
 * canonical-fixer.ts의 findStaticMetadataObject/hasSpreadElement와 동일 로직을 의도적으로 복제한다
 * (공유 모듈 추출 안 함 — canonical-fixer.ts는 Phase 1.5 완료 코드라 이번 작업 범위에서 건드리지
 * 않는다는 Plan Mode 결정. 복제 비용은 ~20줄).
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

/**
 * og:title/og:url을 openGraph 중첩 객체에 추가한다. 둘은 독립적으로 처리된다 — 한쪽만 없으면
 * 그것만 추가하고, 이미 있는 필드는(빈 문자열이어도) 절대 덮어쓰지 않는다(add-safe-guard.ts 원칙).
 * ogTitle/ogUrl은 이미 검증된 같은 페이지 값의 복사본이어야 한다(값을 새로 만들지 않음) — 호출부가
 * null을 넘기면 그 필드는 아예 후보에서 제외한다(복사할 원본이 없다는 뜻).
 */
export function planOgFix(filePath: string, ogTitle: string | null, ogUrl: string | null): OgFixPlan {
  const found = findStaticMetadataObject(filePath);
  if (!found) {
    return {
      applicable: false,
      reason:
        "metadata가 정적 object literal(export const metadata = {...}) 형태가 아닙니다" +
        "(generateMetadata 동적 함수·metadata 부재·변수 참조·스프레드 중 하나) — 제안만 제공합니다",
    };
  }

  const { objLit } = found;
  const originalText = objLit.getSourceFile().getFullText();

  const candidates: Array<{ field: "title" | "url"; value: string }> = [];
  if (ogTitle) candidates.push({ field: "title", value: ogTitle });
  if (ogUrl) candidates.push({ field: "url", value: ogUrl });
  if (candidates.length === 0) {
    return { applicable: false, reason: "복사할 원본 값이 없습니다(title·canonical 모두 부재) — 제안만 제공합니다" };
  }

  const added: Array<{ field: "title" | "url"; value: string }> = [];
  const ogProp = objLit.getProperty("openGraph");

  if (ogProp) {
    const ogInitializer = ogProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const ogObjLit = ogInitializer?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!ogObjLit) {
      return { applicable: false, reason: "openGraph 필드가 정적 object literal이 아닙니다(변수 참조 등) — 제안만 제공합니다" };
    }
    if (hasSpreadElement(ogObjLit)) {
      return {
        applicable: false,
        reason: "openGraph에 스프레드가 섞여 있어 필드 존재 여부를 정적으로 확신할 수 없습니다 — 제안만 제공합니다",
      };
    }

    for (const candidate of candidates) {
      try {
        assertFieldAbsent(ogObjLit, candidate.field);
      } catch (err) {
        if (!(err instanceof AddSafeViolationError)) throw err;
        continue; // 이미 존재 — 값과 무관하게 절대 덮어쓰지 않는다(멱등, fail-closed)
      }
      ogObjLit.addPropertyAssignment({ name: candidate.field, initializer: JSON.stringify(candidate.value) });
      added.push(candidate);
    }
  } else {
    const parts = candidates.map((c) => `${c.field}: ${JSON.stringify(c.value)}`);
    objLit.addPropertyAssignment({ name: "openGraph", initializer: `{ ${parts.join(", ")} }` });
    added.push(...candidates);
  }

  if (added.length === 0) {
    return {
      applicable: true,
      reason: "openGraph.title·url이 이미 존재해 변경하지 않습니다(멱등)",
      originalText,
      updatedText: originalText,
      added: [],
    };
  }

  const updatedText = objLit.getSourceFile().getFullText();
  return {
    applicable: true,
    reason: `openGraph 추가: ${added.map((a) => a.field).join(", ")}`,
    originalText,
    updatedText,
    added,
  };
}

/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeOgFix(filePath: string, updatedText: string): void {
  fs.writeFileSync(filePath, updatedText, "utf-8");
}
