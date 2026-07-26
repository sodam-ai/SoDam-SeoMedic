import { describe, it, expect } from "vitest";
import { diffSignals, hasRawRenderedIndexingGap } from "../../src/render/dom-diff.js";
import type { PageSignals } from "../../src/render/dom-signals.js";

const empty: PageSignals = {
  title: null,
  canonical: null,
  h1Count: 0,
  h1Text: null,
  metaRobots: null,
  jsonLdBlocks: [],
  ogTitle: null,
  ogUrl: null,
  ogDescription: null,
  metaDescription: null,
  imagesWithoutAltCount: 0,
};

describe("diffSignals", () => {
  it("동일 신호는 diff 없음", () => {
    const a: PageSignals = { ...empty, title: "같음" };
    expect(diffSignals(a, { ...a })).toEqual([]);
  });

  it("필드별로 차이를 정확히 잡는다(전체 텍스트 diff 아님)", () => {
    const raw: PageSignals = { ...empty, canonical: null, title: "제목" };
    const rendered: PageSignals = { ...empty, canonical: "https://example.com/c", title: "제목" };
    const diffs = diffSignals(raw, rendered);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("canonical");
    expect(diffs[0].rawValue).toBeNull();
    expect(diffs[0].renderedValue).toBe("https://example.com/c");
  });
});

describe("hasRawRenderedIndexingGap", () => {
  it("canonical이 raw에는 없고 rendered(JS)에만 있으면 gap=true (핵심 시나리오)", () => {
    const raw: PageSignals = { ...empty, canonical: null };
    const rendered: PageSignals = { ...empty, canonical: "https://example.com/c" };
    expect(hasRawRenderedIndexingGap(raw, rendered)).toBe(true);
  });

  it("둘 다 canonical이 있으면 gap 없음", () => {
    const raw: PageSignals = { ...empty, canonical: "https://example.com/c" };
    const rendered: PageSignals = { ...empty, canonical: "https://example.com/c" };
    expect(hasRawRenderedIndexingGap(raw, rendered)).toBe(false);
  });

  it("h1Count 차이는 인덱싱 크리티컬 필드가 아니므로 gap 판정에 영향 없음", () => {
    const raw: PageSignals = { ...empty, h1Count: 0 };
    const rendered: PageSignals = { ...empty, h1Count: 3 };
    expect(hasRawRenderedIndexingGap(raw, rendered)).toBe(false);
  });
});
