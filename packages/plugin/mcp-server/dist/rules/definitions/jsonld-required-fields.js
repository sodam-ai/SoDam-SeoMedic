import { parseJsonLdNodes, getTypes } from "./jsonld-shared.js";
const RULE_ID = "R-JSONLD-PRODUCT-INCOMPLETE";
const VERSION = 1;
/**
 * schema.org Product 타입에 한해 Google 공식 문서(Rich Results용 product-snippet 가이드,
 * developers.google.com/search/docs/appearance/structured-data/product-snippet, 2026-07-18 확인)
 * 기준 필수 속성만 검사한다: name은 필수, review/aggregateRating/offers 중 최소 1개 필수.
 * 다른 타입(Article 등)은 포함하지 않음 — Article 공식 문서는 "There are no required properties"라고
 * 명시해 필수 필드 자체가 없음을 직접 확인했기 때문(추측으로 만들면 PRD의 "환각 0" 요구를 어기게 됨).
 * 타입을 인식했는데 필드가 빠진 경우라 "완전 부재"(low)보다 심각 — medium.
 */
function findMissingProductFields(node) {
    const missing = [];
    if (typeof node.name !== "string" || node.name.trim() === "")
        missing.push("name");
    const hasReview = node.review !== undefined;
    const hasAggregateRating = node.aggregateRating !== undefined;
    const hasOffers = node.offers !== undefined;
    if (!hasReview && !hasAggregateRating && !hasOffers)
        missing.push("review/aggregateRating/offers 중 최소 1개");
    return missing;
}
export const jsonLdProductIncompleteRule = {
    id: RULE_ID,
    version: VERSION,
    category: "schema",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        for (const block of ctx.renderedSignals.jsonLdBlocks) {
            const nodes = parseJsonLdNodes(block);
            if (!nodes)
                continue;
            for (const node of nodes) {
                if (!getTypes(node).includes("Product"))
                    continue;
                const missing = findMissingProductFields(node);
                if (missing.length === 0)
                    continue;
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
//# sourceMappingURL=jsonld-required-fields.js.map