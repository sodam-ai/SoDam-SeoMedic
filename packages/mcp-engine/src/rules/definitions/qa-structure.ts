import type { Rule, RuleViolation } from "../types.js";
import { parseJsonLdNodes, getTypes } from "./jsonld-shared.js";

const RULE_ID = "R-QA-STRUCTURE-MISSING";
const VERSION = 1;
const QA_TYPES = new Set(["FAQPage", "QAPage"]);

/**
 * FAQPage/QAPage 타입 JSON-LD 존재 여부만 확인한다(PRD: "Q&A 구조·검증가능 수치가 존재").
 * 노출 여부는 비결정적이라 측정 대상이 아니므로(PRD 명시: "AI 노출 보장 X"), 안내 문구도
 * "추가하면 AI 답변엔진에 노출된다"처럼 과장하지 않는다. 부재는 결함이 아니라 기회라 low
 * (jsonLdMissingRule·ogBasicMissingRule과 동일 보정). 콘텐츠 창작은 하지 않음(RESEARCH_SOURCES.md가
 * "의미 없는 FAQ 반복 생성"을 안티패턴으로 명시 — 이 규칙은 탐지만, fixer는 존재하지 않음).
 */
export const qaStructureMissingRule: Rule = {
  id: RULE_ID,
  version: VERSION,
  category: "geo",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;

    const hasQaStructure = ctx.renderedSignals.jsonLdBlocks.some((block) => {
      const nodes = parseJsonLdNodes(block);
      if (!nodes) return false;
      return nodes.some((node) => getTypes(node).some((t) => QA_TYPES.has(t)));
    });
    if (hasQaStructure) return null;

    return {
      ruleId: RULE_ID,
      ruleVersion: VERSION,
      category: "geo",
      severity: "low",
      pageUrl: ctx.pageUrl,
      currentValue: null,
      recommendedValue:
        "Q&A 구조(FAQPage/QAPage JSON-LD) 없음 — 해당되면 추가 권장(추가한다고 AI 답변엔진 노출이 보장되진 않음)",
    };
  },
};
