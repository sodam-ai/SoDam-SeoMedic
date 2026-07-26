const RULE_ID_MISSING = "R-CANONICAL-MISSING";
const RULE_ID_JS_ONLY = "R-CANONICAL-JS-ONLY";
const VERSION = 1;
export const canonicalMissingRule = {
    id: RULE_ID_MISSING,
    version: VERSION,
    category: "canonical",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.rawSignals.canonical || ctx.renderedSignals.canonical)
            return null;
        return {
            ruleId: RULE_ID_MISSING,
            ruleVersion: VERSION,
            category: "canonical",
            severity: "high",
            pageUrl: ctx.pageUrl,
            currentValue: null,
            recommendedValue: "self-canonical 추가 권장",
        };
    },
};
/**
 * canonical이 raw HTML엔 없고 JS 렌더링 후에만 존재. Google은 raw HTML을 canonical 판단의
 * 1차 근거로 우선하므로(공식 근거), 이 gap 자체가 "검색엔진이 canonical을 못 볼 수 있다"는 위험 신호다.
 */
export const canonicalJsOnlyRule = {
    id: RULE_ID_JS_ONLY,
    version: VERSION,
    category: "canonical",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.rawSignals.canonical || !ctx.renderedSignals.canonical)
            return null;
        return {
            ruleId: RULE_ID_JS_ONLY,
            ruleVersion: VERSION,
            category: "canonical",
            severity: "critical",
            pageUrl: ctx.pageUrl,
            currentValue: "canonical은 JS로만 존재",
            recommendedValue: `raw HTML에 <link rel="canonical" href="${ctx.renderedSignals.canonical}"> 직접 추가`,
        };
    },
};
//# sourceMappingURL=canonical.js.map