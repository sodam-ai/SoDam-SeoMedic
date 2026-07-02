import type { RuleViolation } from "../rules/types.js";
import type { CwvMeasurement } from "../cwv/lighthouse-runner.js";

export interface PageReportInput {
  url: string;
  statusCode: number;
  violations: RuleViolation[];
  cwv?: CwvMeasurement;
}

export interface AuditReportInput {
  target: string;
  generatedAt: string; // ISO8601, 호출자가 주입(테스트 결정성 확보 — Date.now() 직접 호출 금지)
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
