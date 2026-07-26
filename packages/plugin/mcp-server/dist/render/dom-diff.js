/**
 * raw(JS 미실행)와 rendered(Playwright 실행 후) 신호를 필드 단위로 비교한다.
 * 전체 HTML 텍스트를 diff하지 않는다 — 공백/속성 순서 차이 같은 노이즈로 오탐이 커지기 때문.
 */
export function diffSignals(raw, rendered) {
    const diffs = [];
    const fields = Object.keys(rendered);
    for (const field of fields) {
        // 배열 필드(jsonLdBlocks)는 raw/rendered가 별개 인스턴스라 참조비교가 항상 true — 스칼라만 비교 대상
        if (Array.isArray(raw[field]) || Array.isArray(rendered[field]))
            continue;
        if (raw[field] !== rendered[field]) {
            diffs.push({ field, rawValue: raw[field], renderedValue: rendered[field] });
        }
    }
    return diffs;
}
/**
 * "canonical이 JS로만 존재" 같은 인덱싱 핵심 신호가 raw에는 없고 rendered에만 있는지 판정.
 * 검색엔진은 raw HTML을 canonical 판단의 1차 근거로 우선하므로(Google 공식 근거) 이 gap 자체가 위험 신호다.
 */
export function hasRawRenderedIndexingGap(raw, rendered) {
    const indexingCriticalFields = ["canonical", "title", "metaRobots"];
    return indexingCriticalFields.some((field) => !raw[field] && Boolean(rendered[field]));
}
//# sourceMappingURL=dom-diff.js.map