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
/**
 * og:image 부재(또는 빈 content) — 링크 공유 시 대표 이미지가 안 뜰 수 있다. 탐지(report_only)만 한다.
 *
 * - 기존 R-OG-BASIC-MISSING 등은 건드리지 않고 새 rule_id로 분리했다: 기존 규칙의 version을 올리면
 *   finding_key(page_url+rule_id+rule_version)가 바뀌어 과거 베이스라인과 회귀 비교가 끊긴다.
 * - fixer가 없는 이유: 복사할 원본이 페이지에 없고(어떤 <img>가 대표인지 추측하면 값 발명),
 *   이미지 URL을 실제로 요청해 크기·형식을 확인하려면 SSRF 신규 공격면(보안 M1)이 열린다.
 *   그래서 태그의 content가 비었는지만 본다 — 이미지가 실제로 존재하는지는 검사하지 않는다.
 * - 알려진 한계: og:image:url 같은 변형 속성만 있는 페이지는 부재로 판정될 수 있다(og:title 등과 동일하게
 *   property="og:image" 정확 일치만 인정). 공백뿐인 content도 부재로 본다.
 */
export declare const ogImageMissingRule: Rule;
