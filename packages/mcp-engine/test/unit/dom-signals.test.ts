import { describe, it, expect } from "vitest";
import { extractSignalsFromHtml } from "../../src/render/dom-signals.js";

describe("extractSignalsFromHtml", () => {
  it("정상 HTML에서 모든 신호를 추출한다", () => {
    const html = `<html><head>
      <title>테스트 페이지</title>
      <link rel="canonical" href="https://example.com/canonical" />
      <meta name="robots" content="noindex" />
      <script type="application/ld+json">{"@type":"Article"}</script>
    </head><body><h1>메인 제목</h1><h1>두번째 h1</h1></body></html>`;

    const signals = extractSignalsFromHtml(html);
    expect(signals.title).toBe("테스트 페이지");
    expect(signals.canonical).toBe("https://example.com/canonical");
    expect(signals.metaRobots).toBe("noindex");
    expect(signals.jsonLdBlocks).toEqual(['{"@type":"Article"}']);
    expect(signals.h1Count).toBe(2);
    expect(signals.h1Text).toBe("메인 제목");
  });

  it("신호가 없는 HTML은 전부 null/0/빈 배열", () => {
    const signals = extractSignalsFromHtml("<html><body>비어있음</body></html>");
    expect(signals.title).toBeNull();
    expect(signals.canonical).toBeNull();
    expect(signals.metaRobots).toBeNull();
    expect(signals.jsonLdBlocks).toEqual([]);
    expect(signals.h1Count).toBe(0);
    expect(signals.h1Text).toBeNull();
  });

  it("JSON-LD 블록이 여러 개면 전부 추출한다(Organization + BreadcrumbList)", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    </head><body></body></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.jsonLdBlocks).toHaveLength(2);
  });

  it("깨진(malformed) JSON도 파싱 없이 원문 그대로 추출한다(추출과 검증은 분리)", () => {
    const html = `<html><head><script type="application/ld+json">{not valid json}</script></head></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.jsonLdBlocks).toEqual(["{not valid json}"]);
  });

  it("script type 속성이 대문자여도 추출된다(linkedom 대소문자 회귀 방지)", () => {
    const html = `<html><head><SCRIPT TYPE="APPLICATION/LD+JSON">{"@type":"Thing"}</SCRIPT></head></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.jsonLdBlocks).toEqual(['{"@type":"Thing"}']);
  });

  it("공백만 있는 JSON-LD 블록은 제외된다", () => {
    const html = `<html><head><script type="application/ld+json">   </script></head></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.jsonLdBlocks).toEqual([]);
  });

  it("깨진 HTML도 예외 없이 빈 신호를 반환", () => {
    const signals = extractSignalsFromHtml("<html><title>안닫힘");
    expect(signals).toBeDefined();
  });

  it("meta[name=robots]는 대소문자 무관하게 매칭된다", () => {
    const signals = extractSignalsFromHtml(`<html><head><META NAME="ROBOTS" CONTENT="noindex,nofollow"></head></html>`);
    expect(signals.metaRobots).toBe("noindex,nofollow");
  });

  it("og:title/og:url/og:description은 property 속성으로, meta description은 name 속성으로 추출한다", () => {
    const html = `<html><head>
      <meta property="og:title" content="OG 제목" />
      <meta property="og:url" content="https://example.com/page" />
      <meta property="og:description" content="OG 설명" />
      <meta name="description" content="메타 설명" />
    </head></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.ogTitle).toBe("OG 제목");
    expect(signals.ogUrl).toBe("https://example.com/page");
    expect(signals.ogDescription).toBe("OG 설명");
    expect(signals.metaDescription).toBe("메타 설명");
  });

  it("og:* 태그가 없으면 전부 null(name 속성 og 태그와 혼동하지 않음)", () => {
    const signals = extractSignalsFromHtml(`<html><head><meta name="og:title" content="잘못된 속성"></head></html>`);
    expect(signals.ogTitle).toBeNull();
    expect(signals.ogUrl).toBeNull();
    expect(signals.ogDescription).toBeNull();
    expect(signals.metaDescription).toBeNull();
  });

  it("property 속성이 대문자여도 og 태그가 추출된다(linkedom 대소문자 회귀 방지)", () => {
    const html = `<html><head><META PROPERTY="OG:TITLE" CONTENT="대문자 속성"></head></html>`;
    const signals = extractSignalsFromHtml(html);
    expect(signals.ogTitle).toBe("대문자 속성");
  });
});
