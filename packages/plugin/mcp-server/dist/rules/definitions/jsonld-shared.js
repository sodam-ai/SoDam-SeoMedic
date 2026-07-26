/**
 * JSON-LD 블록 하나를 파싱해 @graph/배열을 평탄화한 노드 목록으로 만든다.
 * 파싱 실패나 최상위 요소가 객체가 아니면 null(호출자가 "무효" 처리).
 * jsonld.ts(구조 유효성 검사)·qa-structure.ts·jsonld-required-fields.ts가 공유한다.
 */
export function parseJsonLdNodes(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return null;
    }
    const topItems = Array.isArray(parsed) ? parsed : [parsed];
    const nodes = [];
    for (const item of topItems) {
        if (typeof item !== "object" || item === null)
            return null;
        const obj = item;
        if (Array.isArray(obj["@graph"]))
            nodes.push(...obj["@graph"]);
        else
            nodes.push(obj);
    }
    return nodes;
}
/** 노드의 @type을 배열로 정규화한다(schema.org는 문자열 또는 배열 둘 다 허용). */
export function getTypes(node) {
    const t = node["@type"];
    if (typeof t === "string")
        return [t];
    if (Array.isArray(t))
        return t.filter((x) => typeof x === "string");
    return [];
}
//# sourceMappingURL=jsonld-shared.js.map