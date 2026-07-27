import type { Rule, RuleViolation } from "../types.js";
import { parseJsonLdNodes, getTypes, type JsonLdNode } from "./jsonld-shared.js";

const RULE_ID = "R-JSONLD-PRODUCT-INCOMPLETE";
const VERSION = 1;

const CONTENT_MISMATCH_RULE_ID = "R-JSONLD-PRODUCT-NAME-MISMATCH";

/**
 * schema.org Product 타입에 한해 Google 공식 문서(Rich Results용 product-snippet 가이드,
 * developers.google.com/search/docs/appearance/structured-data/product-snippet, 2026-07-18 확인)
 * 기준 필수 속성만 검사한다: name은 필수, review/aggregateRating/offers 중 최소 1개 필수.
 * 다른 타입(Article 등)은 포함하지 않음 — Article 공식 문서는 "There are no required properties"라고
 * 명시해 필수 필드 자체가 없음을 직접 확인했기 때문(추측으로 만들면 PRD의 "환각 0" 요구를 어기게 됨).
 * 타입을 인식했는데 필드가 빠진 경우라 "완전 부재"(low)보다 심각 — medium.
 */
function findMissingProductFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (typeof node.name !== "string" || node.name.trim() === "") missing.push("name");
  const hasReview = node.review !== undefined;
  const hasAggregateRating = node.aggregateRating !== undefined;
  const hasOffers = node.offers !== undefined;
  if (!hasReview && !hasAggregateRating && !hasOffers) missing.push("review/aggregateRating/offers 중 최소 1개");
  return missing;
}

export const jsonLdProductIncompleteRule: Rule = {
  id: RULE_ID,
  version: VERSION,
  category: "schema",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;

    for (const block of ctx.renderedSignals.jsonLdBlocks) {
      const nodes = parseJsonLdNodes(block);
      if (!nodes) continue;
      for (const node of nodes) {
        if (!getTypes(node).includes("Product")) continue;
        const missing = findMissingProductFields(node);
        if (missing.length === 0) continue;
        return {
          ruleId: RULE_ID,
          ruleVersion: VERSION,
          category: "schema",
          severity: "medium",
          pageUrl: ctx.pageUrl,
          currentValue: `Product 타입인데 누락: ${missing.join(", ")}`,
          recommendedValue: "Google 필수 속성(name, review/aggregateRating/offers 중 1개 이상) 추가",
        };
      }
    }
    return null;
  },
};

/**
 * PRD Phase 2 성공기준(.PRD/03_PHASES.md:100) "JSON-LD가 페이지 내용과 일치(환각 0)"의 최소 구현.
 * name 필드 하나만 검사한다 — price/offers 같은 숫자·통화 필드는 표시 포맷(쉼표·통화기호·단위)이
 * JSON-LD 원시값과 달라도 정상인 경우가 흔해 단순 substring 비교로는 "불일치"를 오판(=환각)할 위험이
 * 크다. name은 사람이 읽는 텍스트라 페이지 어딘가에 그대로 등장하는 게 정상이므로, 결정론적
 * substring 비교(추측 없음)로도 안전하게 "정말 없다"를 판정할 수 있는 유일한 필드다.
 * bodyText가 비어있으면(파싱 실패 등) 판단 근거가 없으므로 fail-closed로 skip한다(추측 금지).
 */
export const jsonLdProductNameMismatchRule: Rule = {
  id: CONTENT_MISMATCH_RULE_ID,
  version: VERSION,
  category: "schema",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    const bodyText = ctx.renderedSignals.bodyText;
    if (!bodyText) return null;
    const bodyTextLower = bodyText.toLowerCase();

    for (const block of ctx.renderedSignals.jsonLdBlocks) {
      const nodes = parseJsonLdNodes(block);
      if (!nodes) continue;
      for (const node of nodes) {
        if (!getTypes(node).includes("Product")) continue;
        const name = node.name;
        if (typeof name !== "string" || name.trim() === "") continue;
        if (bodyTextLower.includes(name.trim().toLowerCase())) continue;

        return {
          ruleId: CONTENT_MISMATCH_RULE_ID,
          ruleVersion: VERSION,
          category: "schema",
          severity: "high",
          pageUrl: ctx.pageUrl,
          currentValue: `JSON-LD name("${name}")이 페이지 본문 어디에도 나타나지 않음`,
          recommendedValue: "JSON-LD name을 실제 페이지에 표시된 상품명과 일치시키세요",
        };
      }
    }
    return null;
  },
};
