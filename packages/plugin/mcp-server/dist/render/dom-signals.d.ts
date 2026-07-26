import type { Page } from "playwright";
export interface PageSignals {
    title: string | null;
    canonical: string | null;
    h1Count: number;
    h1Text: string | null;
    metaRobots: string | null;
    /** <script type="application/ld+json"> 각 블록의 원문 텍스트(trim, 빈 문자열 제외). 존재 여부는 length>0으로 판단 */
    jsonLdBlocks: string[];
    /** <meta property="og:title" content>. og:*는 name이 아니라 property 속성으로 매칭한다 */
    ogTitle: string | null;
    /** <meta property="og:url" content> */
    ogUrl: string | null;
    /** <meta property="og:description" content> */
    ogDescription: string | null;
    /** <meta name="description" content> */
    metaDescription: string | null;
    /** alt 속성 자체가 없는 <img> 개수. alt="" (장식용 이미지의 의도된 빈 값)는 위반이 아니므로 카운트 제외 */
    imagesWithoutAltCount: number;
}
/**
 * linkedom은 태그명은 소문자로 정규화하지만(HTML5 스펙과 동일) **속성명은 원문 대소문자를 그대로 보존한다**
 * (실측 확인됨 — 브라우저/jsdom과 다른 동작). 그래서 `meta[name="robots" i]` 같은 속성 CSS 셀렉터는
 * 원본 HTML이 `<META NAME="ROBOTS">`처럼 대문자면 조용히 매칭 실패한다(에러 없이 null 반환이라 더 위험).
 * 이 때문에 raw 추출은 태그명으로만 querySelectorAll하고, 속성은 이 헬퍼로 대소문자 무관 비교한다.
 */
export declare function getAttrCI(el: Element, attrName: string): string | null;
/**
 * raw HTML 문자열(JS 미실행)에서 신호를 추출한다. linkedom으로 파싱 — 정규식 매칭은
 * ReDoS·오탐 위험이 있어 사용하지 않는다(DO-NOT/보안 원칙).
 */
export declare function extractSignalsFromHtml(html: string): PageSignals;
/**
 * Playwright로 렌더링된 실제 DOM에서 동일한 신호를 추출한다.
 * extractSignalsFromHtml과 반드시 같은 필드 구조를 유지해야 raw/rendered 비교(dom-diff)가 성립한다.
 */
export declare function extractSignalsFromPage(page: Page): Promise<PageSignals>;
