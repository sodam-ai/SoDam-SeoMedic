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

function withRenderedBlocks(blocks: string[]): RuleContext {
  return baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: blocks } });
}

describe("R-JSONLD-MISSING", () => {
  it("known-bad: 200 페이지에 JSON-LD 블록이 없으면 low severity로 발화", () => {
    const violations = evaluateAllRules(baseCtx());
    const found = violations.find((v) => v.ruleId === "R-JSONLD-MISSING");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("low");
  });

  it("known-good: 블록이 하나라도 있으면 미발화", () => {
    const violations = evaluateAllRules(withRenderedBlocks(['{"@context":"https://schema.org","@type":"Article"}']));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-MISSING")).toBe(false);
  });

  it("엣지: 404 페이지는 블록이 없어도 미발화(status 게이트)", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-MISSING")).toBe(false);
  });
});

describe("R-JSONLD-INVALID — 오탐 회귀 방지(known-good이 무효로 오분류되면 안 됨)", () => {
  it("known-good: 단일 @type", () => {
    const violations = evaluateAllRules(withRenderedBlocks(['{"@context":"https://schema.org","@type":"Article"}']));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });

  it("known-good: @graph 배열 형태(사이트 전역 스키마의 표준 패턴)", () => {
    const block = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Organization" }, { "@type": "WebSite" }],
    });
    const violations = evaluateAllRules(withRenderedBlocks([block]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });

  it("known-good: 루트가 배열", () => {
    const block = JSON.stringify([
      { "@context": "https://schema.org", "@type": "Organization" },
      { "@context": "https://schema.org", "@type": "WebSite" },
    ]);
    const violations = evaluateAllRules(withRenderedBlocks([block]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });

  it("known-good: 객체형 @context", () => {
    const block = JSON.stringify({ "@context": { "@vocab": "https://schema.org/" }, "@type": "Product" });
    const violations = evaluateAllRules(withRenderedBlocks([block]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });

  it("known-good: 배열형 @type", () => {
    const block = JSON.stringify({ "@context": "https://schema.org", "@type": ["Product", "SoftwareApplication"] });
    const violations = evaluateAllRules(withRenderedBlocks([block]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });

  it("known-bad: malformed JSON", () => {
    const violations = evaluateAllRules(withRenderedBlocks(["{not valid json}"]));
    const found = violations.find((v) => v.ruleId === "R-JSONLD-INVALID");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
  });

  it("known-bad: @context·@type 완전 부재(@graph 없이)", () => {
    const block = JSON.stringify({ name: "그냥 평범한 JSON" });
    const violations = evaluateAllRules(withRenderedBlocks([block]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(true);
  });

  it("known-bad: 다중 블록 중 하나만 깨져도 발화", () => {
    const good = '{"@context":"https://schema.org","@type":"Article"}';
    const bad = "{broken";
    const violations = evaluateAllRules(withRenderedBlocks([good, bad]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(true);
  });

  it("MISSING과 INVALID는 상호배타 — INVALID 발화 시 MISSING은 미발화", () => {
    const violations = evaluateAllRules(withRenderedBlocks(["{broken"]));
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(true);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-MISSING")).toBe(false);
  });

  it("next/script 시뮬레이션: raw엔 없고 rendered에만 유효 블록이 있으면 둘 다 미발화", () => {
    const ctx = baseCtx({
      rawSignals: { ...emptySignals, jsonLdBlocks: [] },
      renderedSignals: { ...emptySignals, jsonLdBlocks: ['{"@context":"https://schema.org","@type":"Article"}'] },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-MISSING")).toBe(false);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-INVALID")).toBe(false);
  });
});
