import type { AuditReportInput } from "./types.js";
/**
 * overall_score는 숫자로 절대 노출하지 않고 라벨(양호/주의/위험)만 보여준다(02_DATA_MODEL 결정).
 * CWV는 매 페이지 섹션마다 "lab 값이며 field(CrUX)와 다름"을 명시한다(01_PRD 성공기준).
 */
export declare function buildMarkdownReport(input: AuditReportInput): string;
