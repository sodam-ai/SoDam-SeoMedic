import type { PageSignals } from "../render/dom-signals.js";
import type { CwvMeasurement } from "../cwv/lighthouse-runner.js";
export type Category = "indexing" | "canonical" | "cwv" | "meta" | "schema" | "geo";
export type Severity = "critical" | "high" | "medium" | "low";
export interface RuleContext {
    pageUrl: string;
    statusCode: number;
    finalUrl: string;
    redirectChain: string[];
    rawSignals: PageSignals;
    renderedSignals: PageSignals;
    /** CWV는 비용이 커서 모든 페이지에 강제하지 않는다 — 있으면 평가, 없으면 cwv 규칙은 조용히 skip */
    cwv?: CwvMeasurement;
}
export interface RuleViolation {
    ruleId: string;
    ruleVersion: number;
    category: Category;
    severity: Severity;
    pageUrl: string;
    currentValue: string | null;
    recommendedValue: string | null;
}
export interface Rule {
    id: string;
    version: number;
    category: Category;
    /** 규칙 하나가 여러 위반을 낼 수도 있어(예: raw-rendered-gap이 필드별로) 배열도 허용한다 */
    evaluate(ctx: RuleContext): RuleViolation | RuleViolation[] | null;
}
