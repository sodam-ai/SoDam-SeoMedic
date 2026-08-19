import { z } from "zod";
import { buildSummary, sortByImpact } from "./summary.js";
const ViolationSchema = z.object({
    ruleId: z.string(),
    ruleVersion: z.number(),
    category: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    currentValue: z.string().nullable(),
    recommendedValue: z.string().nullable(),
});
const PageSchema = z.object({
    url: z.string(),
    statusCode: z.number(),
    violations: z.array(ViolationSchema),
    cwv: z
        .object({
        lcpMs: z.number().nullable(),
        clsUnitless: z.number().nullable(),
        inpProxyTbtMs: z.number().nullable(),
        isLabData: z.literal(true),
        note: z.string(),
    })
        .nullable(),
    fieldData: z
        .object({
        lcpMs: z.number().nullable(),
        clsUnitless: z.number().nullable(),
        inpMs: z.number().nullable(),
        isFieldData: z.literal(true),
        note: z.string(),
    })
        .nullable(),
});
export const JsonReportSchema = z.object({
    target: z.string(),
    generatedAt: z.string(),
    overallLabel: z.enum(["양호", "주의", "위험"]),
    summary: z.object({
        totalPages: z.number(),
        totalViolations: z.number(),
        bySeverity: z.record(z.string(), z.number()),
    }),
    pages: z.array(PageSchema),
});
const CWV_NOTE = "lab 값(Lighthouse 3회 측정 중앙값)입니다 — Google 검색 랭킹에 실제로 쓰이는 field(CrUX) 데이터와 다를 수 있습니다.";
/**
 * 리포트 JSON을 만들고, 자체 스키마로 즉시 검증한다(구조적 버그를 빌드 시점에 바로 잡기 위함).
 * overall_score는 절대 숫자 점수로 노출하지 않는다 — overallLabel(양호/주의/위험)만 제공한다
 * (02_DATA_MODEL 결정: "내부 참고 라벨로만, 절대점수 표기 금지").
 */
export function buildJsonReport(input) {
    const summary = buildSummary(input);
    const report = {
        target: input.target,
        generatedAt: input.generatedAt,
        overallLabel: summary.overallLabel,
        summary: {
            totalPages: summary.totalPages,
            totalViolations: summary.totalViolations,
            bySeverity: summary.bySeverity,
        },
        pages: input.pages.map((page) => ({
            url: page.url,
            statusCode: page.statusCode,
            violations: sortByImpact(page.violations).map((v) => ({
                ruleId: v.ruleId,
                ruleVersion: v.ruleVersion,
                category: v.category,
                severity: v.severity,
                currentValue: v.currentValue,
                recommendedValue: v.recommendedValue,
            })),
            cwv: page.cwv
                ? {
                    lcpMs: page.cwv.lcpMs,
                    clsUnitless: page.cwv.clsUnitless,
                    inpProxyTbtMs: page.cwv.inpProxyTbtMs,
                    isLabData: true,
                    note: CWV_NOTE,
                }
                : null,
            fieldData: page.fieldData
                ? {
                    lcpMs: page.fieldData.lcpMs,
                    clsUnitless: page.fieldData.clsUnitless,
                    inpMs: page.fieldData.inpMs,
                    isFieldData: true,
                    note: page.fieldData.note,
                }
                : null,
        })),
    };
    JsonReportSchema.parse(report); // 스키마 불일치는 즉시 예외(리포트가 조용히 깨진 형태로 나가는 것 방지)
    return report;
}
//# sourceMappingURL=json.js.map