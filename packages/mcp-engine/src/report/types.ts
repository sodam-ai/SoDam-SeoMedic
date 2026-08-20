import type { RuleViolation } from "../rules/types.js";
import type { CwvMeasurement } from "../cwv/lighthouse-runner.js";
import type { GscSearchAnalyticsSummary, Ga4MetricsSummary } from "../integrations/types.js";

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
  generatedAt: string; // ISO8601, 호출자가 주입(테스트 결정성 확보 — Date.now() 직접 호출 금지)
  pages: PageReportInput[];
  /**
   * 사이트 전체 요약값(페이지별 아님) — 선택 기능, 둘 다 env var 미설정 시 undefined.
   * PSI(fieldData, 페이지별)와 다르게 실패해도 조용히 넘기지 않는다 — *Error에 이유를 남겨 리포트에
   * 노출한다. GSC/GA4는 설정 실패 지점이 API 키 하나뿐인 PSI보다 훨씬 많아(서비스계정 권한 미부여
   * 등) 완전 침묵이면 비개발자 사용자가 원인을 알 방법이 없다(TROUBLESHOOTING 매트릭스와 같은 방향).
   */
  gsc?: GscSearchAnalyticsSummary;
  gscError?: string;
  ga4?: Ga4MetricsSummary;
  ga4Error?: string;
}

export type OverallLabel = "양호" | "주의" | "위험";

export interface ReportSummary {
  totalPages: number;
  totalViolations: number;
  bySeverity: Record<string, number>;
  /** 절대 점수가 아니라 참고용 라벨 — 02_DATA_MODEL 결정("overall_score → 내부 참고 라벨로만") */
  overallLabel: OverallLabel;
}
