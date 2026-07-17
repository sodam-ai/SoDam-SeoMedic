import type { RuleViolation } from "../rules/types.js";
import type { AuditReportInput, ReportSummary } from "./types.js";
/** 임팩트(심각도) 순 정렬 — critical > high > medium > low. 같은 심각도끼리는 원래 순서 유지(안정 정렬). */
export declare function sortByImpact(violations: RuleViolation[]): RuleViolation[];
export declare function buildSummary(input: AuditReportInput): ReportSummary;
