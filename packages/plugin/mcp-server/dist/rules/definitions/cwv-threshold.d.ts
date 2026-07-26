import type { Rule } from "../types.js";
export declare const cwvLcpPoorRule: Rule;
export declare const cwvClsPoorRule: Rule;
/**
 * rule_id에 "INP"가 아니라 "TBT"를 쓴다 — 실제로 측정하는 값이 진짜 INP(실사용자 상호작용 필요, lab
 * 측정 불가)가 아니라 그 근사 프록시인 Total Blocking Time이기 때문(CwvMeasurement.inpProxyTbtMs
 * 필드명과 동일한 정직성 원칙). "INP를 측정한다"는 오해를 주지 않기 위한 의도적 명명.
 */
export declare const cwvTbtPoorRule: Rule;
