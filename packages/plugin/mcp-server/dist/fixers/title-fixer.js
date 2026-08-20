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
 * title이 raw/rendered 어디에도 전혀 없을 때(R-TITLE-MISSING), 같은 페이지의 렌더된 h1 텍스트를
 * 그대로 복사해 metadata.title에 채운다 — canonical/og-fixer.ts와 동일한 "값 발명 없음" 원칙을
 * "이미 있는 필드 값 복사"가 아니라 "이미 페이지에 실제로 존재하는 다른 텍스트(h1)를 그대로 복사"에
 * 적용한 사례다. 새 문구를 짓지 않는다 — h1이 없으면 복사할 원본이 없으므로 report_only로 폴백한다.
 *
 * ⚠️ 1차 범위(의도적 축소, JSON-LD website fixer의 "루트 레이아웃 1곳만"과 동일한 성격의 결정):
 * `export const metadata`가 **이미 존재**할 때(다른 필드가 있어 title만 빠진 경우)만 다룬다. metadata
 * export 자체가 파일에 전혀 없는 경우(App Router에서 title이 완전히 없다면 이쪽이 더 흔할 수 있음)는
 * "새 export 블록을 처음부터 생성"이라는 더 큰 문제라 이번 라운드에서 손대지 않고 report_only로
 * 남긴다 — canonical/og/noindex fixer 전부가 공유하는 findStaticMetadataObject 전제와 동일하게
 * 유지해, 이번 fixer만 다른 종류의 위험(신규 export 삽입)을 새로 떠안지 않는다.
 */
export function planTitleFix(filePath, h1Title) {
    const found = findStaticMetadataObject(filePath);
    if (!found) {
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