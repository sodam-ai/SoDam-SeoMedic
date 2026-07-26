import type { Rule } from "../types.js";
export declare const statusClientErrorRule: Rule;
export declare const statusServerErrorRule: Rule;
/** 리다이렉트 홉이 2회 이상이면 크롤 예산 낭비 + 링크주스 손실 위험 */
export declare const redirectChainLongRule: Rule;
