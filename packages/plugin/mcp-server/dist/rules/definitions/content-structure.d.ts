import type { Rule } from "../types.js";
/**
 * title은 canonical과 마찬가지로 검색 스니펫·랭킹에 직접 반영되는 핵심 인덱싱 신호라
 * canonicalMissingRule과 동일한 패턴(raw·rendered 어느 한쪽에라도 있으면 미발화)과 동일한
 * severity(high)를 쓴다. raw엔 없고 rendered(JS)에만 있는 경우는 이미 R-RAW-RENDERED-GAP-TITLE이
 * 다루므로(og.ts에 명시된 "한 근본원인당 한 신호" 원칙과 동일), 여기서는 "완전히 없음"만 본다.
 */
export declare const titleMissingRule: Rule;
/**
 * h1은 rendered 기준으로만 판단한다(Google은 렌더링해서 봄 — jsonLdMissingRule과 동일 원칙).
 * 부재가 title·canonical만큼 항상 결정적이진 않아(레이아웃에 따라 시각적 헤딩과 분리되는 경우도 있음)
 * 한 단계 낮은 medium으로 보정한다.
 */
export declare const h1MissingRule: Rule;
/**
 * h1이 여러 개인 것은 HTML5 섹셔닝 규격상 항상 잘못된 게 아니다(카드형 리스트 등 정당한 패턴 존재).
 * "결함"이 아니라 "확인 권장"에 가까운 낮은 신호로만 다뤄 오탐 리스크를 낮춘다
 * (jsonLdMissingRule과 동일한 보정 원칙 — Phase 1 성공기준의 "오탐 0" 원칙을 존중).
 */
export declare const h1MultipleRule: Rule;
/**
 * alt 속성이 아예 없는 <img>만 센다 — alt=""(장식용 이미지의 의도된 빈 값, 스크린리더가 건너뛰도록
 * 하는 정당한 패턴)는 위반이 아니다. PRD가 alt "자동 생성"은 환각 위험으로 명시적 위험군(gated)
 * 분류했지만, 이건 title/h1과 동일하게 탐지만 하고 자동수정은 만들지 않는다(report_only).
 * 아이콘·장식용 이미지가 많은 사이트에서 과탐지될 수 있어 low로 보정(og/jsonld-missing과 동일 원칙).
 */
export declare const imgAltMissingRule: Rule;
