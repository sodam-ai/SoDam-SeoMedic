import { parseHTML } from "linkedom";
/**
 * linkedom은 태그명은 소문자로 정규화하지만(HTML5 스펙과 동일) **속성명은 원문 대소문자를 그대로 보존한다**
 * (실측 확인됨 — 브라우저/jsdom과 다른 동작). 그래서 `meta[name="robots" i]` 같은 속성 CSS 셀렉터는
 * 원본 HTML이 `<META NAME="ROBOTS">`처럼 대문자면 조용히 매칭 실패한다(에러 없이 null 반환이라 더 위험).
 * 이 때문에 raw 추출은 태그명으로만 querySelectorAll하고, 속성은 이 헬퍼로 대소문자 무관 비교한다.
 */
export function getAttrCI(el, attrName) {
    const lower = attrName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase() === lower)
            return attr.value;
    }
    return null;
}
/** 연속 공백/줄바꿈을 스페이스 하나로 축약 + trim. raw/rendered 양쪽에서 동일하게 적용해야 대칭이 깨지지 않는다. */
function normalizeBodyText(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
}
/**
 * raw HTML 문자열(JS 미실행)에서 신호를 추출한다. linkedom으로 파싱 — 정규식 매칭은
 * ReDoS·오탐 위험이 있어 사용하지 않는다(DO-NOT/보안 원칙).
 */
export function extractSignalsFromHtml(html) {
    let document;
    try {
        ({ document } = parseHTML(html));
    }
    catch {
        return {
            title: null,
            canonical: null,
            h1Count: 0,
            h1Text: null,
            metaRobots: null,
            metaGooglebot: null,
            jsonLdBlocks: [],
            ogTitle: null,
            ogUrl: null,
            ogDescription: null,
            ogImage: null,
            metaDescription: null,
            mainFirstParagraphText: null,
            imagesWithoutAltCount: 0,
            bodyText: "",
        };
    }
    // "문서의 첫 <title>"이 아니라 "SVG 안이 아닌 첫 <title>"이다 — 인라인 SVG의 <title>(접근성 이름)을 페이지
    // title로 오인하면 head에 title이 없는데도 R-TITLE-MISSING이 조용히 미발화한다(브라우저 document.title도
    // HTML 네임스페이스의 title만 본다). rendered 추출(extractSignalsFromPage)과 반드시 같은 기준을 쓴다.
    const title = Array.from(document.querySelectorAll("title")).find((el) => !el.closest("svg"))?.textContent?.trim() ?? null;
    const canonicalLink = Array.from(document.querySelectorAll("link")).find((el) => getAttrCI(el, "rel")?.toLowerCase() === "canonical");
    const canonical = canonicalLink ? getAttrCI(canonicalLink, "href") : null;
    const h1Elements = Array.from(document.querySelectorAll("h1"));
    const metaEls = Array.from(document.querySelectorAll("meta"));
    const metaByName = (name) => {
        const el = metaEls.find((e) => getAttrCI(e, "name")?.toLowerCase() === name);
        return el ? getAttrCI(el, "content") : null;
    };
    const metaByProperty = (prop) => {
        const el = metaEls.find((e) => getAttrCI(e, "property")?.toLowerCase() === prop);
        return el ? getAttrCI(el, "content") : null;
    };
    const metaRobots = metaByName("robots");
    const metaGooglebot = metaByName("googlebot");
    const metaDescription = metaByName("description");
    const ogTitle = metaByProperty("og:title");
    const ogUrl = metaByProperty("og:url");
    const ogDescription = metaByProperty("og:description");
    const ogImage = metaByProperty("og:image");
    const jsonLdBlocks = Array.from(document.querySelectorAll("script"))
        .filter((el) => getAttrCI(el, "type")?.toLowerCase() === "application/ld+json")
        .map((el) => el.textContent?.trim() ?? "")
        .filter((text) => text.length > 0);
    const imagesWithoutAltCount = Array.from(document.querySelectorAll("img")).filter((el) => getAttrCI(el, "alt") === null).length;
    const bodyText = normalizeBodyText(document.querySelector("body")?.textContent);
    const mainEl = document.querySelector("main");
    const mainFirstParagraphText = mainEl
        ? (Array.from(mainEl.querySelectorAll("p"))
            .map((p) => p.textContent?.trim() ?? "")
            .find((t) => t.length > 0) ?? null)
        : null;
    return {
        title,
        canonical,
        h1Count: h1Elements.length,
        h1Text: h1Elements[0]?.textContent?.trim() ?? null,
        metaRobots,
        metaGooglebot,
        jsonLdBlocks,
        ogTitle,
        ogUrl,
        ogDescription,
        ogImage,
        metaDescription,
        mainFirstParagraphText,
        imagesWithoutAltCount,
        bodyText,
    };
}
/**
 * Playwright로 렌더링된 실제 DOM에서 동일한 신호를 추출한다.
 * extractSignalsFromHtml과 반드시 같은 필드 구조를 유지해야 raw/rendered 비교(dom-diff)가 성립한다.
 */
export async function extractSignalsFromPage(page) {
    return page.evaluate(() => {
        // extractSignalsFromHtml과 동일 기준(SVG 안의 <title>은 페이지 title이 아니다). page.evaluate로
        // 직렬화되어 실행되므로 외부 헬퍼를 참조하지 않고 인라인으로 쓴다.
        const titleEl = Array.from(document.querySelectorAll("title")).find((el) => !el.closest("svg"));
        const canonicalEl = document.querySelector('link[rel="canonical"]');
        const h1Elements = Array.from(document.querySelectorAll("h1"));
        const metaRobotsEl = document.querySelector('meta[name="robots" i]');
        const metaGooglebotEl = document.querySelector('meta[name="googlebot" i]');
        const metaDescriptionEl = document.querySelector('meta[name="description" i]');
        const ogTitleEl = document.querySelector('meta[property="og:title" i]');
        const ogUrlEl = document.querySelector('meta[property="og:url" i]');
        const ogDescriptionEl = document.querySelector('meta[property="og:description" i]');
        const ogImageEl = document.querySelector('meta[property="og:image" i]');
        const jsonLdBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json" i]'))
            .map((el) => (el.textContent ?? "").trim())
            .filter((text) => text.length > 0);
        const imagesWithoutAltCount = Array.from(document.querySelectorAll("img")).filter((el) => !el.hasAttribute("alt")).length;
        // normalizeBodyText와 동일한 규칙(연속 공백/줄바꿈→스페이스 하나+trim)을 인라인 적용한다 —
        // 이 콜백은 page.evaluate로 브라우저 컨텍스트에 직렬화돼 실행되므로 외부 함수를 참조할 수 없다.
        const bodyText = (document.querySelector("body")?.textContent ?? "").replace(/\s+/g, " ").trim();
        const mainEl = document.querySelector("main");
        const mainFirstParagraphText = mainEl
            ? (Array.from(mainEl.querySelectorAll("p"))
                .map((p) => p.textContent?.trim() ?? "")
                .find((t) => t.length > 0) ?? null)
            : null;
        return {
            title: titleEl?.textContent?.trim() ?? null,
            canonical: canonicalEl?.getAttribute("href") ?? null,
            h1Count: h1Elements.length,
            h1Text: h1Elements[0]?.textContent?.trim() ?? null,
            metaRobots: metaRobotsEl?.getAttribute("content") ?? null,
            metaGooglebot: metaGooglebotEl?.getAttribute("content") ?? null,
            jsonLdBlocks,
            ogTitle: ogTitleEl?.getAttribute("content") ?? null,
            ogUrl: ogUrlEl?.getAttribute("content") ?? null,
            ogDescription: ogDescriptionEl?.getAttribute("content") ?? null,
            ogImage: ogImageEl?.getAttribute("content") ?? null,
            metaDescription: metaDescriptionEl?.getAttribute("content") ?? null,
            mainFirstParagraphText,
            imagesWithoutAltCount,
            bodyText,
        };
    });
}
//# sourceMappingURL=dom-signals.js.map