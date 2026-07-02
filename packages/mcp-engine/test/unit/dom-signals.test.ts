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
    expect(signals.hasJsonLd).toBe(true);
    expect(signals.h1Count).toBe(2);
    expect(signals.h1Text).toBe("메인 제목");
  });

  it("신호가 없는 HTML은 전부 null/0/false", () => {
    const signals = extractSignalsFromHtml("<html><body>비어있음</body></html>");
    expect(signals.title).toBeNull();
    expect(signals.canonical).toBeNull();
    expect(signals.metaRobots).toBeNull();
    expect(signals.hasJsonLd).toBe(false);
    expect(signals.h1Count).toBe(0);
    expect(signals.h1Text).toBeNull();
  });

  it("깨진 HTML도 예외 없이 빈 신호를 반환", () => {
    const signals = extractSignalsFromHtml("<html><title>안닫힘");
    expect(signals).toBeDefined();
  });

  it("meta[name=robots]는 대소문자 무관하게 매칭된다", () => {
    const signals = extractSignalsFromHtml(`<html><head><META NAME="ROBOTS" CONTENT="noindex,nofollow"></head></html>`);
    expect(signals.metaRobots).toBe("noindex,nofollow");
  });
});
