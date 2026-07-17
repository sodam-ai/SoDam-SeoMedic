const RULE_ID = "R-NOINDEX-DETECTED";
const VERSION = 1;
/**
 * 렌더링된(최종) DOM 기준 noindex 여부를 판정한다 — 검색엔진은 결국 실행된 페이지를 인덱싱 판단에
 * 반영하므로 rendered가 최종 권위 있는 값이다. 의도된 설정일 수도 있어 severity는 medium(정보성).
 */
export const noindexDetectedRule = {
    id: RULE_ID,
    version: VERSION,
    category: "indexing",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        const robots = ctx.renderedSignals.metaRobots?.toLowerCase() ?? "";
        if (!robots.includes("noindex"))
            return null;
        return {
            ruleId: RULE_ID,
            ruleVersion: VERSION,
            category: "indexing",
            severity: "medium",
            pageUrl: ctx.pageUrl,
            currentValue: ctx.renderedSignals.metaRobots,
            recommendedValue: "의도된 설정이 아니면 noindex 제거",
        };
    },
};
//# sourceMappingURL=indexing.js.map