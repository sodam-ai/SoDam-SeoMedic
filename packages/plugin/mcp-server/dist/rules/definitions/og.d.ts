import type { Rule } from "../types.js";
/**
 * og:title 또는 og:url이 없으면 발화. og:url은 복사할 canonical 자체가 없으면 침묵한다 —
 * R-CANONICAL-MISSING이 근본원인을 이미 high로 보고 중이라 중복 신호를 만들지 않는다
 * (jsonld의 MISSING/INVALID 상호배타와 동일한 "한 근본원인당 한 신호" 원칙).
 * 부재는 결함이 아니라 기회라 low로 유지(jsonLdMissingRule과 동일 보정).
 */
export declare const ogBasicMissingRule: Rule;
/** og:description 부재 — fixer 없음(복사할 원본 meta description이 없으면 생성 자체가 불가능한 경우가 흔함). */
export declare const ogDescriptionMissingRule: Rule;
/** <meta name="description"> 부재 — fixer 있음(meta-description-fixer.ts, B-2 2026-09-01):
 * <main> 안의 첫 문단이 있을 때만 복사해 채우고, 없으면 여전히 report_only(값 창작 금지 원칙 유지). */
export declare const metaDescriptionMissingRule: Rule;
