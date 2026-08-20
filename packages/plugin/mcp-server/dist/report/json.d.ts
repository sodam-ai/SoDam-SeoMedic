import { z } from "zod";
import type { AuditReportInput } from "./types.js";
export declare const JsonReportSchema: z.ZodObject<{
    target: z.ZodString;
    generatedAt: z.ZodString;
    overallLabel: z.ZodEnum<{
        양호: "양호";
        주의: "주의";
        위험: "위험";
    }>;
    summary: z.ZodObject<{
        totalPages: z.ZodNumber;
        totalViolations: z.ZodNumber;
        bySeverity: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, z.core.$strip>;
    gsc: z.ZodNullable<z.ZodObject<{
        propertyScope: z.ZodString;
        clicks: z.ZodNumber;
        impressions: z.ZodNumber;
        position: z.ZodNumber;
    }, z.core.$strip>>;
    gscError: z.ZodNullable<z.ZodString>;
    ga4: z.ZodNullable<z.ZodObject<{
        propertyId: z.ZodString;
        sessions: z.ZodNumber;
        activeUsers: z.ZodNumber;
    }, z.core.$strip>>;
    ga4Error: z.ZodNullable<z.ZodString>;
    pages: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        statusCode: z.ZodNumber;
        violations: z.ZodArray<z.ZodObject<{
            ruleId: z.ZodString;
            ruleVersion: z.ZodNumber;
            category: z.ZodString;
            severity: z.ZodEnum<{
                critical: "critical";
                high: "high";
                medium: "medium";
                low: "low";
            }>;
            currentValue: z.ZodNullable<z.ZodString>;
            recommendedValue: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        cwv: z.ZodNullable<z.ZodObject<{
            lcpMs: z.ZodNullable<z.ZodNumber>;
            clsUnitless: z.ZodNullable<z.ZodNumber>;
            inpProxyTbtMs: z.ZodNullable<z.ZodNumber>;
            isLabData: z.ZodLiteral<true>;
            note: z.ZodString;
        }, z.core.$strip>>;
        fieldData: z.ZodNullable<z.ZodObject<{
            lcpMs: z.ZodNullable<z.ZodNumber>;
            clsUnitless: z.ZodNullable<z.ZodNumber>;
            inpMs: z.ZodNullable<z.ZodNumber>;
            isFieldData: z.ZodLiteral<true>;
            note: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JsonReport = z.infer<typeof JsonReportSchema>;
/**
 * 리포트 JSON을 만들고, 자체 스키마로 즉시 검증한다(구조적 버그를 빌드 시점에 바로 잡기 위함).
 * overall_score는 절대 숫자 점수로 노출하지 않는다 — overallLabel(양호/주의/위험)만 제공한다
 * (02_DATA_MODEL 결정: "내부 참고 라벨로만, 절대점수 표기 금지").
 */
export declare function buildJsonReport(input: AuditReportInput): JsonReport;
