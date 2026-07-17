import type { PageSignals } from "./dom-signals.js";
export interface SignalDiff {
    field: keyof PageSignals;
    rawValue: unknown;
    renderedValue: unknown;
}
/**
 * raw(JS 미실행)와 rendered(Playwright 실행 후) 신호를 필드 단위로 비교한다.
 * 전체 HTML 텍스트를 diff하지 않는다 — 공백/속성 순서 차이 같은 노이즈로 오탐이 커지기 때문.
 */
export declare function diffSignals(raw: PageSignals, rendered: PageSignals): SignalDiff[];
/**
 * "canonical이 JS로만 존재" 같은 인덱싱 핵심 신호가 raw에는 없고 rendered에만 있는지 판정.
 * 검색엔진은 raw HTML을 canonical 판단의 1차 근거로 우선하므로(Google 공식 근거) 이 gap 자체가 위험 신호다.
 */
export declare function hasRawRenderedIndexingGap(raw: PageSignals, rendered: PageSignals): boolean;
