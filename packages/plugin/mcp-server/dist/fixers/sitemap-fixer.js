import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";
import { assertArrayEntryAbsent, AddSafeViolationError } from "./add-safe-guard.js";
/**
 * app/sitemap.ts가 "정적 배열 리터럴을 반환하는 단순한 형태"일 때만 add_safe로 다룬다
 * (02_DATA_MODEL "빠진 sitemap 항목 추가=add_safe" vs 04_PROJECT_SPEC "sitemap 전체=gated"의
 * 긴장을 해소한 설계 결정 — Plan Mode에서 확정). 그 이상의 구조(동적 계산·조건분기 등)는 아예
 * 손대지 않고 report_only로 넘긴다(추측 금지, fail-closed).
 */
function findStaticSitemapArray(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const defaultExportFn = sourceFile
        .getFunctions()
        .find((fn) => fn.isDefaultExport());
    if (!defaultExportFn)
        return null;
    const returnStatements = defaultExportFn.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    if (returnStatements.length !== 1)
        return null; // 조건분기로 여러 return이 있으면 "단순 정적" 아님
    const arrLit = returnStatements[0].getExpressionIfKind(SyntaxKind.ArrayLiteralExpression);
    if (!arrLit)
        return null; // 배열 리터럴이 아니면(변수 참조·함수 호출 등) 정적 분석 불가
    // 각 원소가 전부 객체 리터럴이어야 한다(스프레드·함수호출 등이 섞여 있으면 동적으로 간주)
    const allPlainObjects = arrLit.getElements().every((el) => el.getKind() === SyntaxKind.ObjectLiteralExpression);
    if (!allPlainObjects)
        return null;
    return { project, arrLit };
}
export function planSitemapFix(filePath, missingUrls) {
    const found = findStaticSitemapArray(filePath);
    if (!found) {
        return {
            applicable: false,
            reason: "sitemap.ts가 정적 배열 리터럴을 반환하는 단순한 형태가 아닙니다(동적 계산 가능성) — 제안만 제공합니다",
        };
    }
    const { arrLit } = found;
    const originalText = arrLit.getSourceFile().getFullText();
    const urlsToAdd = [];
    for (const url of missingUrls) {
        try {
            assertArrayEntryAbsent(arrLit, (el) => {
                if (el.getKind() !== SyntaxKind.ObjectLiteralExpression)
                    return false;
                const urlProp = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperty("url");
                const initializer = urlProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
                const literalValue = initializer?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
                return literalValue === url;
            });
            urlsToAdd.push(url); // 가드가 안 던졌다 = 아직 없음 = 추가 대상
        }
        catch (err) {
            if (!(err instanceof AddSafeViolationError))
                throw err;
            // 이미 있음 — 조용히 스킵(멱등성: 재실행해도 중복 추가 안 됨)
        }
    }
    if (urlsToAdd.length === 0) {
        return { applicable: true, reason: "추가할 새 URL이 없습니다(이미 전부 존재)", urlsToAdd: [], originalText, updatedText: originalText };
    }
    for (const url of urlsToAdd) {
        arrLit.addElement(`{ url: ${JSON.stringify(url)} }`);
    }
    const updatedText = arrLit.getSourceFile().getFullText();
    return { applicable: true, reason: `sitemap에 ${urlsToAdd.length}개 URL 추가 가능`, urlsToAdd, originalText, updatedText };
}
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export function writeSitemapFix(filePath, updatedText) {
    fs.writeFileSync(filePath, updatedText, "utf-8");
}
//# sourceMappingURL=sitemap-fixer.js.map