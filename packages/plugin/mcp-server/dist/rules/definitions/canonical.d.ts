import type { Rule } from "../types.js";
export declare const canonicalMissingRule: Rule;
/**
 * canonical이 raw HTML엔 없고 JS 렌더링 후에만 존재. Google은 raw HTML을 canonical 판단의
 * 1차 근거로 우선하므로(공식 근거), 이 gap 자체가 "검색엔진이 canonical을 못 볼 수 있다"는 위험 신호다.
 */
export declare const canonicalJsOnlyRule: Rule;
