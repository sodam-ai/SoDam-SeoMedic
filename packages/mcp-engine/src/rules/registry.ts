import type { Rule, RuleContext, RuleViolation } from "./types.js";
import { canonicalMissingRule, canonicalJsOnlyRule } from "./definitions/canonical.js";
import { noindexDetectedRule } from "./definitions/indexing.js";
import { jsonLdMissingRule, jsonLdInvalidRule } from "./definitions/jsonld.js";
import { qaStructureMissingRule } from "./definitions/qa-structure.js";
import { jsonLdProductIncompleteRule, jsonLdProductNameMismatchRule } from "./definitions/jsonld-required-fields.js";
import {
  ogBasicMissingRule,
  ogDescriptionMissingRule,
  metaDescriptionMissingRule,
  ogImageMissingRule,
} from "./definitions/og.js";
import { statusClientErrorRule, statusServerErrorRule, redirectChainLongRule } from "./definitions/status-redirect.js";
import { rawRenderedGapRule } from "./definitions/raw-rendered-gap.js";
import { cwvLcpPoorRule, cwvClsPoorRule, cwvTbtPoorRule } from "./definitions/cwv-threshold.js";
import {
  titleMissingRule,
  h1MissingRule,
  h1MultipleRule,
  imgAltMissingRule,
} from "./definitions/content-structure.js";

export const ALL_RULES: Rule[] = [
  canonicalMissingRule,
  canonicalJsOnlyRule,
  noindexDetectedRule,
  jsonLdMissingRule,
  jsonLdInvalidRule,
  qaStructureMissingRule,
  jsonLdProductIncompleteRule,
  jsonLdProductNameMismatchRule,
  ogBasicMissingRule,
  ogDescriptionMissingRule,
  metaDescriptionMissingRule,
  statusClientErrorRule,
  statusServerErrorRule,
  redirectChainLongRule,
  rawRenderedGapRule,
  cwvLcpPoorRule,
  cwvClsPoorRule,
  cwvTbtPoorRule,
  titleMissingRule,
  h1MissingRule,
  h1MultipleRule,
  imgAltMissingRule,
  // 14개 영역 확장 — 4번 OG의 결손 보완(2026-10): 기존 og 규칙은 version 그대로 두고 새 rule_id로 추가
  ogImageMissingRule,
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
