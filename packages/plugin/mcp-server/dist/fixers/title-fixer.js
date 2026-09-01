import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";
import { assertFieldAbsent, AddSafeViolationError } from "./add-safe-guard.js";
/**
 * noindex-fixer.ts/og-fixer.ts의 findStaticMetadataObject/hasSpreadElement와 동일 로직을 의도적으로
 * 복제한다(이 저장소의 기존 관례 — 각 fixer 파일을 독립적으로 유지해 다른 fixer의 검증된 동작을 절대
 * 건드리지 않는다. 복제 비용은 ~20줄).
 */
function hasSpreadElement(objLit) {
    return objLit.getProperties().some((p) => p.getKind() === SyntaxKind.SpreadAssignment);
}
function findStaticMetadataObject(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const generateMetadataFn = sourceFile.getFunctions().find((fn) => fn.isExported() && fn.getName() === "generateMetadata");
    if (generateMetadataFn)
        return null;
    const metadataDecl = sourceFile.getVariableDeclaration("metadata");
    if (!metadataDecl)
        return null;
    const varStatement = metadataDecl.getVariableStatement();
    if (!varStatement?.isExported())
        return null;
    const objLit = metadataDecl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!objLit)
        return null;
    if (hasSpreadElement(objLit))
        return null;
    return { project, objLit };
}
/**
 * 파일에 'use client' 지시어가 있는지 확인한다. Next.js App Router는 Client Component에서
 * metadata export 자체를 금지한다(빌드 에러) — 이런 파일에 새 export를 삽입하면 안 되므로 이 함수로
 * 먼저 걸러낸다. 'use client'는 관례상 파일의 첫 statement(문자열 리터럴 표현식)여야 유효하므로 그
 * 자리만 확인한다(파일 중간의 문자열 리터럴은 지시어가 아니다 — 오탐 방지).
 */
function hasUseClientDirective(sourceFile) {
    const first = sourceFile.getStatements()[0];
    if (!first || first.getKind() !== SyntaxKind.ExpressionStatement)
        return false;
    const expr = first.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
    if (expr.getKind() !== SyntaxKind.StringLiteral)
        return false;
    return expr.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue() === "use client";
}
/**
 * metadata export도 generateMetadata 함수도 파일에 전혀 없을 때, title 하나만 담은 새
 * `export const metadata = {...}` 문을 처음부터 삽입한다(B-1 확장, 2026-09-01 — 원래 1차 범위에서
 * 제외했던 "신규 export 생성" 케이스). findStaticMetadataObject와 별개의 독립 파싱을 쓴다(이 파일
 * 상단 주석과 동일한 이유 — 기존 경로를 절대 건드리지 않기 위해 복제 비용을 감수).
 *
 * 반환값이 null이면 "이 케이스가 아니다"(metadata나 generateMetadata가 이미 있음)라는 뜻으로,
 * 호출부가 기존 report_only 경로로 그대로 폴백한다.
 */
function tryInsertNewMetadataExport(filePath, h1Title) {
    if (!fs.existsSync(filePath))
        return null;
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const generateMetadataFn = sourceFile.getFunctions().find((fn) => fn.isExported() && fn.getName() === "generateMetadata");
    if (generateMetadataFn)
        return null; // 기존 경로가 처리(제네릭 report_only 메시지)
    const metadataDecl = sourceFile.getVariableDeclaration("metadata");
    if (metadataDecl)
        return null; // metadata가 이미 어떤 형태로든 있음 — 기존 경로가 처리
    if (hasUseClientDirective(sourceFile)) {
        return {
            applicable: false,
            reason: "'use client' 컴포넌트는 metadata export를 가질 수 없습니다(Next.js 제약) — 제안만 제공합니다",
        };
    }
    if (!h1Title) {
        return { applicable: false, reason: "복사할 원본 값이 없습니다(h1도 없음) — 제안만 제공합니다" };
    }
    const originalText = sourceFile.getFullText();
    const imports = sourceFile.getImportDeclarations();
    const lastImport = imports[imports.length - 1];
    const insertIndex = lastImport ? lastImport.getChildIndex() + 1 : 0;
    sourceFile.insertStatements(insertIndex, `\nexport const metadata = {\n  title: ${JSON.stringify(h1Title)},\n};\n`);
    const updatedText = sourceFile.getFullText();
    return {
        applicable: true,
        reason: "metadata export가 없어 title만 담은 새 export를 추가함(같은 페이지의 렌더된 h1 텍스트를 그대로 복사)",
        originalText,
        updatedText,
    };
}
/**
 * title이 raw/rendered 어디에도 전혀 없을 때(R-TITLE-MISSING), 같은 페이지의 렌더된 h1 텍스트를
 * 그대로 복사해 metadata.title에 채운다 — canonical/og-fixer.ts와 동일한 "값 발명 없음" 원칙을
 * "이미 있는 필드 값 복사"가 아니라 "이미 페이지에 실제로 존재하는 다른 텍스트(h1)를 그대로 복사"에
 * 적용한 사례다. 새 문구를 짓지 않는다 — h1이 없으면 복사할 원본이 없으므로 report_only로 폴백한다.
 *
 * `export const metadata`가 이미 존재하면(다른 필드가 있어 title만 빠진 경우) 그 객체에 title만
 * 추가한다. metadata export 자체가 파일에 전혀 없으면(generateMetadata도 없을 때) 새 export 블록을
 * 처음부터 삽입한다(tryInsertNewMetadataExport, B-1 확장) — 단 'use client' 컴포넌트는 Next.js가
 * metadata export 자체를 금지하므로 제외한다.
 */
export function planTitleFix(filePath, h1Title) {
    const found = findStaticMetadataObject(filePath);
    if (!found) {
        const inserted = tryInsertNewMetadataExport(filePath, h1Title);
        if (inserted)
            return inserted;
        return {
            applicable: false,
            reason: "metadata가 정적 object literal(export const metadata = {...}) 형태가 아닙니다" +
                "(generateMetadata 동적 함수·metadata 부재·변수 참조·스프레드 중 하나) — 제안만 제공합니다",
        };
    }
    if (!h1Title) {
        return { applicable: false, reason: "복사할 원본 값이 없습니다(h1도 없음) — 제안만 제공합니다" };
    }
    const { objLit } = found;
    const originalText = objLit.getSourceFile().getFullText();
    try {
        assertFieldAbsent(objLit, "title");
    }
    catch (err) {
        if (!(err instanceof AddSafeViolationError))
            throw err;
        // 이미 title 필드가 존재(빈 문자열 등) — 값과 무관하게 절대 덮어쓰지 않는다(멱등, fail-closed).
        return { applicable: true, reason: "title이 이미 존재해 변경하지 않습니다(멱등)", originalText, updatedText: originalText };
    }
    objLit.addPropertyAssignment({ name: "title", initializer: JSON.stringify(h1Title) });
    const updatedText = objLit.getSourceFile().getFullText();
    return { applicable: true, reason: "title 추가(같은 페이지의 렌더된 h1 텍스트를 그대로 복사)", originalText, updatedText };
}
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeTitleFix(filePath, updatedText) {
    fs.writeFileSync(filePath, updatedText, "utf-8");
}
//# sourceMappingURL=title-fixer.js.map