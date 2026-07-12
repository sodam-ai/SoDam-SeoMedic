import type { Rule, RuleContext, RuleViolation } from "./types.js";
import { canonicalMissingRule, canonicalJsOnlyRule } from "./definitions/canonical.js";
import { noindexDetectedRule } from "./definitions/indexing.js";
import { jsonLdMissingRule, jsonLdInvalidRule } from "./definitions/jsonld.js";
import { ogBasicMissingRule, ogDescriptionMissingRule, metaDescriptionMissingRule } from "./definitions/og.js";
import { statusClientErrorRule, statusServerErrorRule, redirectChainLongRule } from "./definitions/status-redirect.js";
import { rawRenderedGapRule } from "./definitions/raw-rendered-gap.js";
import { cwvLcpPoorRule, cwvClsPoorRule } from "./definitions/cwv-threshold.js";

export const ALL_RULES: Rule[] = [
  canonicalMissingRule,
  canonicalJsOnlyRule,
  noindexDetectedRule,
  jsonLdMissingRule,
  jsonLdInvalidRule,
  ogBasicMissingRule,
  ogDescriptionMissingRule,
  metaDescriptionMissingRule,
  statusClientErrorRule,
  statusServerErrorRule,
  redirectChainLongRule,
  rawRenderedGapRule,
  cwvLcpPoorRule,
  cwvClsPoorRule,
];

/** rule_id는 registry 전체에서 유일해야 finding_key(page_url+rule_id+rule_version) 매칭이 안정적이다. */
function assertUniqueRuleIds(rules: Rule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`중복된 rule_id 발견: ${rule.id}`);
    seen.add(rule.id);
  }
}
assertUniqueRuleIds(ALL_RULES);

export function evaluateAllRules(ctx: RuleContext, rules: Rule[] = ALL_RULES): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    const result = rule.evaluate(ctx);
    if (!result) continue;
    if (Array.isArray(result)) violations.push(...result);
    else violations.push(result);
  }
  return violations;
}
