import type { Rule } from "../types.js";
/**
 * title/metaRobots가 raw엔 없고 rendered(JS)에만 있는 경우 — 검색엔진이 raw를 우선 참고하므로
 * 이 gap 자체가 인덱싱 리스크다(canonical과 동일 원리, 필드만 다름).
 */
export declare const rawRenderedGapRule: Rule;
