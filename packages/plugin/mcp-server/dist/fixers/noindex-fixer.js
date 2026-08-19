import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";
/**
 * canonical-fixer.ts/og-fixer.ts의 findStaticMetadataObject/hasSpreadElement와 동일 로직을 의도적으로
 * 복제한다(공유 모듈 추출 안 함 — 이 저장소가 이미 채택한 관례: 각 fixer 파일을 독립적으로 유지해
 * 다른 fixer의 검증된 동작을 절대 건드리지 않는다. 복제 비용은 ~20줄).
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
 * robots.index를 false→true로 교정한다("noindex 제거"). canonical/og fixer의 "값 발명 없음" 원칙을
 * "추가"가 아니라 "이미 있는 boolean 리터럴 교정"에 적용한 사례 — 새 문구를 짓지 않고 이미 있는 false를
 * true로 뒤집기만 한다(04_PROJECT_SPEC "noindex는 gated" — 승인 게이트를 거치는 값 교정이라 title/meta
 * "기존 값 덮어쓰기 금지" 원칙과 충돌하지 않는다. 그 원칙은 "새 문구 발명"을 막는 것이지, 이미 명시된
 * boolean 오탐지를 사람 승인 하에 고치는 것을 막지 않는다).
 *
 * robots가 문자열("noindex, nofollow" 등)이거나 index가 boolean 리터럴이 아니면(변수·함수호출 등)
 * 정적으로 안전을 확신할 수 없어 report_only로 폴백한다.
 *
 * ⚠️ robots.googleBot이 별도로 존재하면 절대 손대지 않는다 — Google은 googleBot 전용 메타태그를 일반
 * robots 태그보다 우선 적용한다(공식 문서 확인 필요 항목으로 별도 표시). top-level index만 고치면
 * googleBot.index가 여전히 false로 남아있는 경우, "고쳤다"고 보고하지만 실제로는 Googlebot 기준
 * noindex가 그대로인 거짓 성공을 만들 수 있어 fail-closed로 제외한다.
 */
export function planNoindexFix(filePath) {
    const found = findStaticMetadataObject(filePath);
    if (!found) {
        return {
            applicable: false,
            reason: "metadata가 정적 object literal(export const metadata = {...}) 형태가 아닙니다" +
                "(generateMetadata 동적 함수·metadata 부재·변수 참조·스프레드 중 하나) — 제안만 제공합니다",
        };
    }
    const { objLit } = found;
    const originalText = objLit.getSourceFile().getFullText();
    const robotsProp = objLit.getProperty("robots");
    if (!robotsProp) {
        return {
            applicable: false,
            reason: "robots 필드를 이 파일에서 찾을 수 없습니다(레이아웃 등 다른 곳에서 상속됐을 수 있어 안전하게 수정할 수 없습니다) — 제안만 제공합니다",
        };
    }
    const robotsInitializer = robotsProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const robotsObjLit = robotsInitializer?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!robotsObjLit) {
        return {
            applicable: false,
            reason: "robots 필드가 정적 object literal이 아닙니다(문자열·변수 참조 등) — 제안만 제공합니다",
        };
    }
    if (hasSpreadElement(robotsObjLit)) {
        return {
            applicable: false,
            reason: "robots에 스프레드가 섞여 있어 index 값을 정적으로 확신할 수 없습니다 — 제안만 제공합니다",
        };
    }
    if (robotsObjLit.getProperty("googleBot")) {
        return {
            applicable: false,
            reason: "robots.googleBot 별도 재정의가 있어 top-level만 고치면 Googlebot 기준으로는 여전히 noindex로 남을 위험이 있습니다 — 제안만 제공합니다",
        };
    }
    const indexProp = robotsObjLit.getProperty("index");
    if (!indexProp) {
        return { applicable: false, reason: "robots.index 필드를 찾을 수 없습니다 — 제안만 제공합니다" };
    }
    const indexAssignment = indexProp.asKind(SyntaxKind.PropertyAssignment);
    const indexInitializer = indexAssignment?.getInitializer();
    if (!indexAssignment || !indexInitializer) {
        return { applicable: false, reason: "robots.index가 property assignment 형태가 아닙니다(단축 프로퍼티 등) — 제안만 제공합니다" };
    }
    if (indexInitializer.getKind() === SyntaxKind.TrueKeyword) {
        // 이미 true — 변경할 것이 없다(멱등, 다른 fixer의 "이미 존재" 분기와 동일 원칙).
        return { applicable: true, reason: "robots.index가 이미 true라 변경하지 않습니다(멱등)", originalText, updatedText: originalText };
    }
    if (indexInitializer.getKind() !== SyntaxKind.FalseKeyword) {
        return {
            applicable: false,
            reason: "robots.index 값이 boolean 리터럴(true/false)이 아닙니다(변수·함수호출 등) — 제안만 제공합니다",
        };
    }
    indexAssignment.setInitializer("true");
    const updatedText = objLit.getSourceFile().getFullText();
    return { applicable: true, reason: "robots.index를 false에서 true로 교정(noindex 제거)", originalText, updatedText };
}
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeNoindexFix(filePath, updatedText) {
    fs.writeFileSync(filePath, updatedText, "utf-8");
}
//# sourceMappingURL=noindex-fixer.js.map