import type { Rule } from "../types.js";
export declare const jsonLdProductIncompleteRule: Rule;
/**
 * PRD Phase 2 성공기준(.PRD/03_PHASES.md:100) "JSON-LD가 페이지 내용과 일치(환각 0)"의 최소 구현.
 * name 필드 하나만 검사한다 — price/offers 같은 숫자·통화 필드는 표시 포맷(쉼표·통화기호·단위)이
 * JSON-LD 원시값과 달라도 정상인 경우가 흔해 단순 substring 비교로는 "불일치"를 오판(=환각)할 위험이
 * 크다. name은 사람이 읽는 텍스트라 페이지 어딘가에 그대로 등장하는 게 정상이므로, 결정론적
 * substring 비교(추측 없음)로도 안전하게 "정말 없다"를 판정할 수 있는 유일한 필드다.
 * bodyText가 비어있으면(파싱 실패 등) 판단 근거가 없으므로 fail-closed로 skip한다(추측 금지).
 */
export declare const jsonLdProductNameMismatchRule: Rule;
