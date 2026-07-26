import type { Rule } from "../types.js";
/**
 * 렌더링된(최종) DOM 기준 noindex 여부를 판정한다 — 검색엔진은 결국 실행된 페이지를 인덱싱 판단에
 * 반영하므로 rendered가 최종 권위 있는 값이다. 의도된 설정일 수도 있어 severity는 medium(정보성).
 */
export declare const noindexDetectedRule: Rule;
