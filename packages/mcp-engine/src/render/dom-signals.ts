import { parseHTML } from "linkedom";
import type { Page } from "playwright";

export interface PageSignals {
  title: string | null;
  canonical: string | null;
  h1Count: number;
  h1Text: string | null;
  metaRobots: string | null;
  hasJsonLd: boolean;
}

/**
 * linkedom은 태그명은 소문자로 정규화하지만(HTML5 스펙과 동일) **속성명은 원문 대소문자를 그대로 보존한다**
 * (실측 확인됨 — 브라우저/jsdom과 다른 동작). 그래서 `meta[name="robots" i]` 같은 속성 CSS 셀렉터는
 * 원본 HTML이 `<META NAME="ROBOTS">`처럼 대문자면 조용히 매칭 실패한다(에러 없이 null 반환이라 더 위험).
 * 이 때문에 raw 추출은 태그명으로만 querySelectorAll하고, 속성은 이 헬퍼로 대소문자 무관 비교한다.
 */
export function getAttrCI(el: Element, attrName: string): string | null {
  const lower = attrName.toLowerCase();
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.toLowerCase() === lower) return attr.value;
  }
  return null;
}

/**
 * raw HTML 문자열(JS 미실행)에서 신호를 추출한다. linkedom으로 파싱 — 정규식 매칭은
 * ReDoS·오탐 위험이 있어 사용하지 않는다(DO-NOT/보안 원칙).
 */
export function extractSignalsFromHtml(html: string): PageSignals {
  let document: Document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return { title: null, canonical: null, h1Count: 0, h1Text: null, metaRobots: null, hasJsonLd: false };
  }

  const title = document.querySelector("title")?.textContent?.trim() ?? null;

  const canonicalLink = Array.from(document.querySelectorAll("link")).find(
    (el) => getAttrCI(el, "rel")?.toLowerCase() === "canonical",
  );
  const canonical = canonicalLink ? getAttrCI(canonicalLink, "href") : null;

  const h1Elements = Array.from(document.querySelectorAll("h1"));

  const metaRobotsEl = Array.from(document.querySelectorAll("meta")).find(
    (el) => getAttrCI(el, "name")?.toLowerCase() === "robots",
  );
  const metaRobots = metaRobotsEl ? getAttrCI(metaRobotsEl, "content") : null;

  const hasJsonLd = Array.from(document.querySelectorAll("script")).some(
    (el) => getAttrCI(el, "type")?.toLowerCase() === "application/ld+json",
  );

  return {
    title,
    canonical,
    h1Count: h1Elements.length,
    h1Text: h1Elements[0]?.textContent?.trim() ?? null,
    metaRobots,
    hasJsonLd,
  };
}

/**
 * Playwright로 렌더링된 실제 DOM에서 동일한 신호를 추출한다.
 * extractSignalsFromHtml과 반드시 같은 필드 구조를 유지해야 raw/rendered 비교(dom-diff)가 성립한다.
 */
export async function extractSignalsFromPage(page: Page): Promise<PageSignals> {
  return page.evaluate(() => {
    const titleEl = document.querySelector("title");
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const h1Elements = Array.from(document.querySelectorAll("h1"));
    const metaRobotsEl = document.querySelector('meta[name="robots" i]');
    const hasJsonLd = document.querySelectorAll('script[type="application/ld+json" i]').length > 0;

    return {
      title: titleEl?.textContent?.trim() ?? null,
      canonical: canonicalEl?.getAttribute("href") ?? null,
      h1Count: h1Elements.length,
      h1Text: h1Elements[0]?.textContent?.trim() ?? null,
      metaRobots: metaRobotsEl?.getAttribute("content") ?? null,
      hasJsonLd,
    };
  });
}
