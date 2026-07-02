import type { Rule, RuleViolation } from "../types.js";
import { diffSignals } from "../../render/dom-diff.js";
import type { PageSignals } from "../../render/dom-signals.js";

const VERSION = 1;

// canonical은 별도 규칙(R-CANONICAL-JS-ONLY, 더 구체적인 안내 문구)에서 이미 다루므로 여기서는 제외 — 중복 finding 방지
const INDEXING_CRITICAL_FIELDS: (keyof PageSignals)[] = ["title", "metaRobots"];

function ruleIdForField(field: keyof PageSignals): string {
  return `R-RAW-RENDERED-GAP-${field.toUpperCase()}`;
}

/**
 * title/metaRobots가 raw엔 없고 rendered(JS)에만 있는 경우 — 검색엔진이 raw를 우선 참고하므로
 * 이 gap 자체가 인덱싱 리스크다(canonical과 동일 원리, 필드만 다름).
 */
export const rawRenderedGapRule: Rule = {
  id: "R-RAW-RENDERED-GAP",
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation[] | null {
    if (ctx.statusCode !== 200) return null;
    const diffs = diffSignals(ctx.rawSignals, ctx.renderedSignals);
    const violations: RuleViolation[] = [];

    for (const diff of diffs) {
      if (!INDEXING_CRITICAL_FIELDS.includes(diff.field)) continue;
      const rawEmpty = !diff.rawValue;
      const renderedHasValue = Boolean(diff.renderedValue);
      if (!rawEmpty || !renderedHasValue) continue;

      violations.push({
        ruleId: ruleIdForField(diff.field),
        ruleVersion: VERSION,
        category: "indexing",
        severity: "high",
        pageUrl: ctx.pageUrl,
        currentValue: `${diff.field}은 JS로만 존재: ${String(diff.renderedValue)}`,
        recommendedValue: `raw HTML에 ${diff.field} 직접 포함`,
      });
    }

    return violations.length > 0 ? violations : null;
  },
};
