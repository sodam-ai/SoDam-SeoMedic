import type { Rule } from "../types.js";
/**
 * JSON-LD가 아예 없는 페이지를 low(advisory)로 알린다. 부재는 "결함"이 아니라 "기회"라 medium을
 * 매기면 정상 페이지에 결함을 암시해 오도한다 — noindex 규칙(의도된 설정일 수 있어 medium)보다도
 * 약한 신호이므로 한 단계 더 낮춘다. rendered 기준(next/script 등 JS 주입도 Google은 렌더링해서 봄).
 */
export declare const jsonLdMissingRule: Rule;
/**
 * JSON-LD가 존재하는데 깨진 경우에만 발화 — 정상 페이지 오탐이 구조적으로 불가능하다.
 * 블록이 여러 개면 첫 번째 non-valid 블록만 보고한다(finding 비대화 방지).
 */
export declare const jsonLdInvalidRule: Rule;
