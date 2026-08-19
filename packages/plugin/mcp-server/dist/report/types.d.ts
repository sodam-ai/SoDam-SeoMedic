import type { RuleViolation } from "../rules/types.js";
import type { CwvMeasurement } from "../cwv/lighthouse-runner.js";
/**
 * 원래 integrations/field-data-merger.ts에 있었으나, PageReportInput이 이 타입을 참조해야 해서
 * (report → integrations → report 순환 타입 참조를 피하기 위해) report 계층으로 옮겼다 —
 * field-data-merger.ts는 이제 여기서 다시 import한다(integrations → report 단방향 유지).
 */
export interface FieldDataSection {
    lcpMs: number | null;
    clsUnitless: number | null;
    inpMs: number | null;
    isFieldData: true;
    note: string;
}
export interface PageReportInput {
    url: string;
    statusCode: number;
    violations: RuleViolation[];
    cwv?: CwvMeasurement;
    /** PSI(CrUX) field 데이터 — mergeFieldData가 채운다. 키 미설정·조회 실패 시 undefined(선택 기능). */
    fieldData?: FieldDataSection;
}
export interface AuditReportInput {
    target: string;
    generatedAt: string;
    pages: PageReportInput[];
}
export type OverallLabel = "양호" | "주의" | "위험";
export interface ReportSummary {
    totalPages: number;
    totalViolations: number;
    bySeverity: Record<string, number>;
    /** 절대 점수가 아니라 참고용 라벨 — 02_DATA_MODEL 결정("overall_score → 내부 참고 라벨로만") */
    overallLabel: OverallLabel;
}
