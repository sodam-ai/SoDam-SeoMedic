import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";
import { assertFieldAbsent, AddSafeViolationError } from "./add-safe-guard.js";
/** 객체 리터럴 안에 스프레드(`...x`)가 섞여 있으면 실제 최종 필드 구성을 정적으로 확신할 수 없다
 * (예: `alternates: { ...base }`에서 base가 이미 canonical을 담고 있을 수 있음) — assertFieldAbsent가
 * 직접 나열된 프로퍼티만 검사하므로, 스프레드가 있으면 그 검사 자체가 무의미해진다. */
function hasSpreadElement(objLit) {
    return objLit.getProperties().some((p) => p.getKind() === SyntaxKind.SpreadAssignment);
}
/**
 * app/**\/page.tsx(또는 layout.tsx)가 "export const metadata = {...}" 정적 object literal일 때만
 * gated로 다룬다(04_PROJECT_SPEC "canonical은 예외 없이 gated" 결정 — Plan Mode에서 확정).
 * generateMetadata() 동적 함수, metadata export 자체의 부재, 변수 참조, 스프레드가 섞인 object
 * literal은 전부 정적 분석 불가로 간주해 report_only로 넘긴다(추측 금지, fail-closed —
 * sitemap-fixer.ts의 findStaticSitemapArray와 동일 원칙).
 */
function findStaticMetadataObject(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const generateMetadataFn = sourceFile.getFunctions().find((fn) => fn.isExported() && fn.getName() === "generateMetadata");
    if (generateMetadataFn)
        return null; // 동적 함수 — 정적 분석 대상 아님
    const metadataDecl = sourceFile.getVariableDeclaration("metadata");
    if (!metadataDecl)
        return null; // metadata export 자체가 없음 — 새로 만들지 않고 report_only(추측 금지)
    const varStatement = metadataDecl.getVariableStatement();
    if (!varStatement?.isExported())
        return null; // export 안 된 동명 변수는 Next.js가 인식하지 않음
    const objLit = metadataDecl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!objLit)
        return null; // 변수 참조·함수 호출 등 — 정적 분석 불가
    if (hasSpreadElement(objLit))
        return null; // 스프레드가 섞이면 실제 필드 구성을 정적으로 확신할 수 없음
    return { project, objLit };
}
/**
 * canonical 값은 상대경로만 쓴다(예: "/about", 루트는 "/") — 배포 도메인이 파이프라인 어디에도 없고
 * (로컬 브릿지 origin·placeholder origin 둘 다 실제 네트워크 전용이 아님), Next.js가 metadataBase
 * 기준 상대경로 해석을 공식 지원하므로 배포 도메인 무관하게 구조적으로 올바른 유일한 값
 * (Plan Mode 확정 결정 — 한계: metadataBase 미설정 시 Next.js가 localhost:3000으로 폴백하나,
 * 이 fixer의 범위 밖).
 */
export function planCanonicalFix(filePath, canonicalPath) {
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
    const alternatesProp = objLit.getProperty("alternates");
    if (alternatesProp) {
        const alternatesInitializer = alternatesProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
        const alternatesObjLit = alternatesInitializer?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!alternatesObjLit) {
            return {
                applicable: false,
                reason: "alternates 필드가 정적 object literal이 아닙니다(변수 참조 등) — 제안만 제공합니다",
            };
        }
        if (hasSpreadElement(alternatesObjLit)) {
            return {
                applicable: false,
                reason: "alternates에 스프레드가 섞여 있어 canonical 존재 여부를 정적으로 확신할 수 없습니다 — 제안만 제공합니다",
            };
        }
        try {
            assertFieldAbsent(alternatesObjLit, "canonical");
        }
        catch (err) {
            if (!(err instanceof AddSafeViolationError))
                throw err;
            // 이미 canonical이 있음 — 값과 무관하게 절대 덮어쓰지 않는다(멱등, fail-closed)
            return {
                applicable: true,
                reason: "alternates.canonical이 이미 존재해 변경하지 않습니다(멱등)",
                originalText,
                updatedText: originalText,
            };
        }
        alternatesObjLit.addPropertyAssignment({ name: "canonical", initializer: JSON.stringify(canonicalPath) });
    }
    else {
        objLit.addPropertyAssignment({ name: "alternates", initializer: `{ canonical: ${JSON.stringify(canonicalPath)} }` });
    }
    const updatedText = objLit.getSourceFile().getFullText();
    return { applicable: true, reason: `alternates.canonical = "${canonicalPath}" 추가 가능`, originalText, updatedText };
}
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeCanonicalFix(filePath, updatedText) {
    fs.writeFileSync(filePath, updatedText, "utf-8");
}
//# sourceMappingURL=canonical-fixer.js.map