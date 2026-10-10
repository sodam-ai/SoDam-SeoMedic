import { describe, it, expect } from "vitest";
import { evaluateAllRules } from "../../src/rules/registry.js";
import type { RuleContext } from "../../src/rules/types.js";
import type { PageSignals } from "../../src/render/dom-signals.js";

const emptySignals: PageSignals = {
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

function baseCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    pageUrl: "https://example.com/",
    statusCode: 200,
    finalUrl: "https://example.com/",
    redirectChain: [],
    rawSignals: { ...emptySignals },
    renderedSignals: { ...emptySignals },
    ...overrides,
  };
}

function withRendered(overrides: Partial<PageSignals>): RuleContext {
  return baseCtx({ renderedSignals: { ...emptySignals, ...overrides } });
}

describe("R-OG-BASIC-MISSING", () => {
  it("known-bad: og:title·og:url 둘 다 없고 canonical은 있으면 둘 다 누락으로 발화(low)", () => {
    const violations = evaluateAllRules(withRendered({ canonical: "https://example.com/" }));
    const found = violations.find((v) => v.ruleId === "R-OG-BASIC-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
    expect(found!.currentValue).toContain("og:title");
    expect(found!.currentValue).toContain("og:url");
  });

  it("known-good: og:title·og:url 둘 다 있으면 미발화", () => {
    const violations = evaluateAllRules(
      withRendered({ ogTitle: "제목", ogUrl: "https://example.com/", canonical: "https://example.com/" }),
    );
    expect(violations.some((v) => v.ruleId === "R-OG-BASIC-MISSING")).toBe(false);
  });

  it("canonical 자체가 없으면 og:url 부재는 억제된다(R-CANONICAL-MISSING이 근본원인을 이미 보고)", () => {
    // canonical 없음 → og:title만 없다는 신호만 남아야 하고, "og:url" 문구는 currentValue에 없어야 한다.
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-OG-BASIC-MISSING");
    expect(found).toBeDefined();
    expect(found!.currentValue).toContain("og:title");
    expect(found!.currentValue).not.toContain("og:url");
  });

  it("canonical도 og:url도 둘 다 없고 og:title만 있으면 완전히 미발화", () => {
    const violations = evaluateAllRules(withRendered({ ogTitle: "제목" }));
    expect(violations.some((v) => v.ruleId === "R-OG-BASIC-MISSING")).toBe(false);
  });

  it("og:title만 없고 og:url·canonical은 있으면 og:title만 누락 보고", () => {
    const violations = evaluateAllRules(withRendered({ ogUrl: "https://example.com/", canonical: "https://example.com/" }));
    const found = violations.find((v) => v.ruleId === "R-OG-BASIC-MISSING");
    expect(found).toBeDefined();
    expect(found!.currentValue).toBe("누락: og:title");
  });

  it("엣지: 404 페이지는 미발화(status 게이트)", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-OG-BASIC-MISSING")).toBe(false);
  });
});

describe("R-OG-DESCRIPTION-MISSING", () => {
  it("known-bad: og:description 없으면 발화(low)", () => {
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-OG-DESCRIPTION-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
  });

  it("known-good: og:description 있으면 미발화", () => {
    const violations = evaluateAllRules(withRendered({ ogDescription: "설명" }));
    expect(violations.some((v) => v.ruleId === "R-OG-DESCRIPTION-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-OG-DESCRIPTION-MISSING")).toBe(false);
  });
});

describe("R-META-DESCRIPTION-MISSING", () => {
  it("known-bad: meta description 없으면 발화(low)", () => {
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-META-DESCRIPTION-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
  });

  it("known-good: meta description 있으면 미발화", () => {
    const violations = evaluateAllRules(withRendered({ metaDescription: "설명" }));
    expect(violations.some((v) => v.ruleId === "R-META-DESCRIPTION-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-META-DESCRIPTION-MISSING")).toBe(false);
  });
});

describe("R-OG-IMAGE-MISSING", () => {
  const find = (ctx: RuleContext) => evaluateAllRules(ctx).find((v) => v.ruleId === "R-OG-IMAGE-MISSING");

  it("known-bad: og:image가 없으면 발화(low, meta) — 이미지 존재·크기는 검사하지 않는다고 안내", () => {
    const found = find(baseCtx());
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
    expect(found!.category).toBe("meta");
    expect(found!.ruleVersion).toBe(1);
    expect(found!.currentValue).toBeNull();
    expect(found!.recommendedValue).toContain("검사하지 않음");
  });

  it("known-good: og:image가 있으면 미발화", () => {
    expect(find(withRendered({ ogImage: "https://example.com/og.png" }))).toBeUndefined();
  });

  it("known-good: 상대경로 og:image도 태그가 있으면 인정(이미지 URL은 요청하지 않으므로 형식 검증 안 함)", () => {
    expect(find(withRendered({ ogImage: "/og.png" }))).toBeUndefined();
  });

  it("엣지: content가 빈 문자열이면 부재로 본다", () => {
    expect(find(withRendered({ ogImage: "" }))).toBeDefined();
  });

  it("엣지: content가 공백뿐이어도 부재로 본다", () => {
    expect(find(withRendered({ ogImage: "   \n\t " }))).toBeDefined();
  });

  it("엣지: 404 페이지는 미발화(status 게이트)", () => {
    expect(find(baseCtx({ statusCode: 404 }))).toBeUndefined();
  });

  it("판정은 rendered 기준 — raw에만 있고 rendered에 없으면 발화(다른 og 규칙과 동일한 기준)", () => {
    const ctx = baseCtx({
      rawSignals: { ...emptySignals, ogImage: "https://example.com/og.png" },
      renderedSignals: { ...emptySignals, ogImage: null },
    });
    expect(find(ctx)).toBeDefined();
  });

  it("기존 og 규칙과 독립: og:image만 없고 다른 og 태그가 모두 있으면 이 규칙만 발화한다", () => {
    const ctx = withRendered({
      canonical: "https://example.com/",
      ogTitle: "t",
      ogUrl: "https://example.com/",
      ogDescription: "d",
    });
    const ids = evaluateAllRules(ctx).map((v) => v.ruleId);
    expect(ids).toContain("R-OG-IMAGE-MISSING");
    expect(ids).not.toContain("R-OG-BASIC-MISSING");
    expect(ids).not.toContain("R-OG-DESCRIPTION-MISSING");
  });
});
