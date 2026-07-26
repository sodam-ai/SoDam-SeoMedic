const RULE_ID_MISSING = "R-JSONLD-MISSING";
const RULE_ID_INVALID = "R-JSONLD-INVALID";
const VERSION = 1;
/**
 * JSON-LD 블록 하나를 분류한다. "어딘가 하나라도 있으면 통과"(any-reachable) 방식 —
 * @graph 배열, 루트 배열, 객체형 @context, 배열형 @type 같은 정상 schema.org 패턴을
 * top-level만 보고 무효로 오분류하지 않기 위함(추측 금지, fail-closed — 확실한 파손만 invalid로 판정).
 */
function classifyBlock(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return "malformed_json";
    }
    const topItems = Array.isArray(parsed) ? parsed : [parsed];
    const reachableTypeNodes = [];
    let hasAnyContext = false;
    for (const item of topItems) {
        if (typeof item !== "object" || item === null)
            return "not_object";
        const obj = item;
        if ("@context" in obj)
            hasAnyContext = true;
        if (Array.isArray(obj["@graph"]))
            reachableTypeNodes.push(...obj["@graph"]);
        else
            reachableTypeNodes.push(obj);
    }
    const hasAnyType = reachableTypeNodes.some((node) => typeof node === "object" && node !== null && "@type" in node);
    if (!hasAnyContext || !hasAnyType)
        return "missing_context_or_type";
    return "valid";
}
/**
 * JSON-LD가 아예 없는 페이지를 low(advisory)로 알린다. 부재는 "결함"이 아니라 "기회"라 medium을
 * 매기면 정상 페이지에 결함을 암시해 오도한다 — noindex 규칙(의도된 설정일 수 있어 medium)보다도
 * 약한 신호이므로 한 단계 더 낮춘다. rendered 기준(next/script 등 JS 주입도 Google은 렌더링해서 봄).
 */
export const jsonLdMissingRule = {
    id: RULE_ID_MISSING,
    version: VERSION,
    category: "schema",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.renderedSignals.jsonLdBlocks.length > 0)
            return null;
        return {
            ruleId: RULE_ID_MISSING,
            ruleVersion: VERSION,
            category: "schema",
            severity: "low",
            pageUrl: ctx.pageUrl,
            currentValue: null,
            recommendedValue: "구조화 데이터(JSON-LD) 없음 — 해당되면 추가 권장",
        };
    },
};
/**
 * JSON-LD가 존재하는데 깨진 경우에만 발화 — 정상 페이지 오탐이 구조적으로 불가능하다.
 * 블록이 여러 개면 첫 번째 non-valid 블록만 보고한다(finding 비대화 방지).
 */
export const jsonLdInvalidRule = {
    id: RULE_ID_INVALID,
    version: VERSION,
    category: "schema",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        const blocks = ctx.renderedSignals.jsonLdBlocks;
        for (let i = 0; i < blocks.length; i++) {
            const status = classifyBlock(blocks[i]);
            if (status === "valid")
                continue;
            const reason = {
                malformed_json: "JSON 파싱 실패",
                not_object: "객체가 아님",
                missing_context_or_type: "@context 또는 @type 부재",
            };
            return {
                ruleId: RULE_ID_INVALID,
                ruleVersion: VERSION,
                category: "schema",
                severity: "high",
                pageUrl: ctx.pageUrl,
                currentValue: `블록 ${i + 1}: ${reason[status]}`,
                recommendedValue: "@context·@type을 포함한 유효한 JSON-LD로 수정",
            };
        }
        return null;
    },
};
//# sourceMappingURL=jsonld.js.map