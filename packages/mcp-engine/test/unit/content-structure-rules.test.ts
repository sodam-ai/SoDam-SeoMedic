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
  jsonLdBlocks: [],
  ogTitle: null,
  ogUrl: null,
  ogDescription: null,
  metaDescription: null,
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

function withRawAndRendered(overrides: Partial<PageSignals>): RuleContext {
  return baseCtx({
    rawSignals: { ...emptySignals, ...overrides },
    renderedSignals: { ...emptySignals, ...overrides },
  });
}

function withRendered(overrides: Partial<PageSignals>): RuleContext {
  return baseCtx({ renderedSignals: { ...emptySignals, ...overrides } });
}

describe("R-TITLE-MISSING", () => {
  it("known-bad: raw·rendered 둘 다 title 없으면 발화(high)", () => {
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-TITLE-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
  });

  it("known-good: raw·rendered 둘 다 title 있으면 미발화", () => {
    const violations = evaluateAllRules(withRawAndRendered({ title: "페이지 제목" }));
    expect(violations.some((v) => v.ruleId === "R-TITLE-MISSING")).toBe(false);
  });

  it("raw엔 없고 rendered(JS)에만 title 있으면 미발화(R-RAW-RENDERED-GAP-TITLE이 이미 다룸, 중복 신호 방지)", () => {
    const violations = evaluateAllRules(withRendered({ title: "JS로만 생긴 제목" }));
    expect(violations.some((v) => v.ruleId === "R-TITLE-MISSING")).toBe(false);
  });

  it("raw에만 title 있고 rendered엔 없으면 미발화(어느 한쪽에라도 있으면 충분)", () => {
    const violations = evaluateAllRules(baseCtx({ rawSignals: { ...emptySignals, title: "raw 제목" } }));
    expect(violations.some((v) => v.ruleId === "R-TITLE-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화(status 게이트)", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-TITLE-MISSING")).toBe(false);
  });
});

describe("R-H1-MISSING", () => {
  it("known-bad: rendered h1Count=0이면 발화(medium)", () => {
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-H1-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("medium");
  });

  it("known-good: rendered h1Count=1이면 미발화", () => {
    const violations = evaluateAllRules(withRendered({ h1Count: 1, h1Text: "제목" }));
    expect(violations.some((v) => v.ruleId === "R-H1-MISSING")).toBe(false);
  });

  it("raw엔 h1이 없고 rendered에만 있어도 미발화(rendered 기준 판단)", () => {
    const violations = evaluateAllRules(withRendered({ h1Count: 1, h1Text: "JS로만 생긴 h1" }));
    expect(violations.some((v) => v.ruleId === "R-H1-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-H1-MISSING")).toBe(false);
  });
});

describe("R-H1-MULTIPLE", () => {
  it("known-bad: rendered h1Count=2 이상이면 발화(low)", () => {
    const violations = evaluateAllRules(withRendered({ h1Count: 3, h1Text: "첫 h1" }));
    const found = violations.find((v) => v.ruleId === "R-H1-MULTIPLE");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
    expect(found!.currentValue).toContain("3개");
  });

  it("known-good: rendered h1Count=1이면 미발화", () => {
    const violations = evaluateAllRules(withRendered({ h1Count: 1, h1Text: "제목" }));
    expect(violations.some((v) => v.ruleId === "R-H1-MULTIPLE")).toBe(false);
  });

  it("known-good: rendered h1Count=0(부재)이면 미발화(R-H1-MISSING의 영역이지 여기 아님)", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.some((v) => v.ruleId === "R-H1-MULTIPLE")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화", () => {
    const violations = evaluateAllRules(
      baseCtx({ statusCode: 404, renderedSignals: { ...emptySignals, h1Count: 2 } }),
    );
    expect(violations.some((v) => v.ruleId === "R-H1-MULTIPLE")).toBe(false);
  });
});

describe("R-IMG-ALT-MISSING", () => {
  it("known-bad: alt 없는 이미지가 있으면 발화(low)", () => {
    const violations = evaluateAllRules(withRendered({ imagesWithoutAltCount: 2 }));
    const found = violations.find((v) => v.ruleId === "R-IMG-ALT-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
    expect(found!.currentValue).toContain("2개");
  });

  it("known-good: imagesWithoutAltCount=0이면 미발화(이미지가 없거나 전부 alt가 있는 경우)", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.some((v) => v.ruleId === "R-IMG-ALT-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화", () => {
    const violations = evaluateAllRules(
      baseCtx({ statusCode: 404, renderedSignals: { ...emptySignals, imagesWithoutAltCount: 3 } }),
    );
    expect(violations.some((v) => v.ruleId === "R-IMG-ALT-MISSING")).toBe(false);
  });
});
