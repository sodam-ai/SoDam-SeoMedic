import { describe, it, expect } from "vitest";
import { evaluateAllRules } from "../../src/rules/registry.js";
import { noindexDetectedRule, noindexVariantDetectedRule } from "../../src/rules/definitions/indexing.js";
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

function ctxWith(rendered: Partial<PageSignals>, overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    pageUrl: "https://example.com/",
    statusCode: 200,
    finalUrl: "https://example.com/",
    redirectChain: [],
    rawSignals: { ...emptySignals },
    renderedSignals: { ...emptySignals, ...rendered },
    ...overrides,
  };
}

function variantViolation(rendered: Partial<PageSignals>, overrides: Partial<RuleContext> = {}) {
  const result = noindexVariantDetectedRule.evaluate(ctxWith(rendered, overrides));
  return Array.isArray(result) ? (result[0] ?? null) : result;
}

describe("R-NOINDEX-VARIANT-DETECTED — noindex의 다른 표기(none, googlebot 메타)", () => {
  it("known-bad: robots 메타가 none이면 발화(medium) — Google 문서상 noindex,nofollow와 같다", () => {
    const v = variantViolation({ metaRobots: "none" });
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe("R-NOINDEX-VARIANT-DETECTED");
    expect(v!.severity).toBe("medium");
    expect(v!.currentValue).toBe("robots: none");
  });

  it("known-bad: googlebot 메타가 noindex 또는 none이면 발화", () => {
    expect(variantViolation({ metaGooglebot: "noindex" })?.currentValue).toBe("googlebot: noindex");
    expect(variantViolation({ metaGooglebot: "none" })?.currentValue).toBe("googlebot: none");
  });

  it("지시어 값은 대소문자 무관, 쉼표 목록 안에서도 찾는다(Google 문서: 값은 대소문자 구분 없음, 쉼표 결합)", () => {
    expect(variantViolation({ metaRobots: "nofollow, None" })).not.toBeNull();
    expect(variantViolation({ metaGooglebot: "NoIndex, Follow" })).not.toBeNull();
  });

  it("robots와 googlebot이 둘 다 해당되면 두 출처를 모두 currentValue에 담는다", () => {
    const v = variantViolation({ metaRobots: "none", metaGooglebot: "noindex" });
    expect(v!.currentValue).toBe("robots: none · googlebot: noindex");
  });

  it("known-good: 색인 허용 지시어·색인과 무관한 지시어는 미발화", () => {
    expect(variantViolation({ metaRobots: "index, follow" })).toBeNull();
    expect(variantViolation({ metaRobots: "noarchive, nosnippet", metaGooglebot: "nosnippet" })).toBeNull();
    expect(variantViolation({ metaGooglebot: "index, follow" })).toBeNull();
    expect(variantViolation({})).toBeNull();
  });

  it("지시어는 '토큰'으로 비교한다 — none을 포함한 다른 단어에 오탐하지 않는다", () => {
    expect(variantViolation({ metaRobots: "nonexistent" })).toBeNull();
    expect(variantViolation({ metaRobots: "none-of-the-above" })).toBeNull();
    expect(variantViolation({ metaGooglebot: "noindexable" })).toBeNull();
  });

  it("일반 noindex는 R-NOINDEX-DETECTED(v1)가 보고하므로 이 규칙은 같은 원인을 두 번 보고하지 않는다", () => {
    expect(variantViolation({ metaRobots: "noindex" })).toBeNull();
    // googlebot에도 noindex가 같이 있어도 마찬가지 — robots 메타에 noindex가 있으면 v1이 이미 보고 중
    expect(variantViolation({ metaRobots: "noindex", metaGooglebot: "noindex" })).toBeNull();
    const ids = evaluateAllRules(ctxWith({ metaRobots: "noindex", metaGooglebot: "noindex" })).map((v) => v.ruleId);
    expect(ids).toContain("R-NOINDEX-DETECTED");
    expect(ids).not.toContain("R-NOINDEX-VARIANT-DETECTED");
  });

  it("R1 고정: v1(R-NOINDEX-DETECTED)은 의도적으로 바뀌지 않았다 — none·googlebot은 v1이 아니라 이 규칙이 맡는다", () => {
    expect(noindexDetectedRule.version).toBe(1);
    expect(noindexDetectedRule.evaluate(ctxWith({ metaRobots: "none" }))).toBeNull();
    expect(noindexDetectedRule.evaluate(ctxWith({ metaGooglebot: "noindex" }))).toBeNull();
    const ids = evaluateAllRules(ctxWith({ metaRobots: "none" })).map((v) => v.ruleId);
    expect(ids).toContain("R-NOINDEX-VARIANT-DETECTED");
    expect(ids).not.toContain("R-NOINDEX-DETECTED");
  });

  it("200이 아닌 응답은 판정하지 않는다", () => {
    expect(variantViolation({ metaRobots: "none" }, { statusCode: 404 })).toBeNull();
  });

  it("최종(rendered) DOM 기준이다 — raw에만 none이 있고 rendered에 없으면 미발화", () => {
    const ctx = ctxWith({}, { rawSignals: { ...emptySignals, metaRobots: "none" } });
    expect(noindexVariantDetectedRule.evaluate(ctx)).toBeNull();
  });
});
