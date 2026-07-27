import { describe, it, expect } from "vitest";
import { evaluateAllRules, ALL_RULES } from "../../src/rules/registry.js";
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
const validJsonLd = '{"@context":"https://schema.org","@type":"WebPage"}';
const validQaJsonLd = '{"@context":"https://schema.org","@type":"FAQPage"}';

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

describe("registry — 무결성", () => {
  it("모든 rule_id는 유일하다", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("R-CANONICAL-MISSING / R-CANONICAL-JS-ONLY", () => {
  it("known-good: raw에 canonical이 있으면 위반 없음", () => {
    const ctx = baseCtx({
      rawSignals: { ...emptySignals, canonical: "https://example.com/" },
      renderedSignals: { ...emptySignals, canonical: "https://example.com/" },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.filter((v) => v.ruleId.startsWith("R-CANONICAL"))).toHaveLength(0);
  });

  it("known-bad: canonical이 아예 없으면 R-CANONICAL-MISSING", () => {
    const ctx = baseCtx();
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CANONICAL-MISSING")).toBe(true);
  });

  it("known-bad: canonical이 JS로만 존재하면 R-CANONICAL-JS-ONLY(critical)", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, canonical: "https://example.com/c" } });
    const violations = evaluateAllRules(ctx);
    const found = violations.find((v) => v.ruleId === "R-CANONICAL-JS-ONLY");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("critical");
    // JS-only 케이스에선 MISSING이 함께 뜨면 안 됨(중복 finding 방지)
    expect(violations.some((v) => v.ruleId === "R-CANONICAL-MISSING")).toBe(false);
  });
});

describe("R-NOINDEX-DETECTED", () => {
  it("known-good: robots 태그 없음", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.some((v) => v.ruleId === "R-NOINDEX-DETECTED")).toBe(false);
  });

  it("known-bad: rendered에 noindex", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, metaRobots: "noindex, nofollow" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-NOINDEX-DETECTED")).toBe(true);
  });
});

describe("R-STATUS-4XX / R-STATUS-5XX", () => {
  it("known-good: 200", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 200 }));
    expect(violations.filter((v) => v.ruleId.startsWith("R-STATUS"))).toHaveLength(0);
  });

  it("known-bad: 404", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 404 }));
    expect(violations.some((v) => v.ruleId === "R-STATUS-4XX")).toBe(true);
  });

  it("known-bad: 503", () => {
    const violations = evaluateAllRules(baseCtx({ statusCode: 503 }));
    expect(violations.some((v) => v.ruleId === "R-STATUS-5XX")).toBe(true);
  });
});

describe("R-REDIRECT-CHAIN-LONG", () => {
  it("known-good: 리다이렉트 없음", () => {
    const violations = evaluateAllRules(baseCtx({ redirectChain: [] }));
    expect(violations.some((v) => v.ruleId === "R-REDIRECT-CHAIN-LONG")).toBe(false);
  });

  it("known-good: 단일 홉", () => {
    const violations = evaluateAllRules(baseCtx({ redirectChain: ["https://example.com/old"] }));
    expect(violations.some((v) => v.ruleId === "R-REDIRECT-CHAIN-LONG")).toBe(false);
  });

  it("known-bad: 2홉 이상", () => {
    const violations = evaluateAllRules(baseCtx({ redirectChain: ["https://example.com/a", "https://example.com/b"] }));
    expect(violations.some((v) => v.ruleId === "R-REDIRECT-CHAIN-LONG")).toBe(true);
  });
});

describe("R-RAW-RENDERED-GAP-*", () => {
  it("known-good: raw/rendered 신호 동일", () => {
    const signals = { ...emptySignals, title: "제목" };
    const violations = evaluateAllRules(baseCtx({ rawSignals: signals, renderedSignals: { ...signals } }));
    expect(violations.filter((v) => v.ruleId.startsWith("R-RAW-RENDERED-GAP"))).toHaveLength(0);
  });

  it("known-bad: title이 JS로만 존재", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, title: "JS로만 생긴 제목" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-RAW-RENDERED-GAP-TITLE")).toBe(true);
  });

  it("known-bad: metaRobots가 JS로만 존재", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, metaRobots: "index,follow" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-RAW-RENDERED-GAP-METAROBOTS")).toBe(true);
  });
});

describe("R-CWV-LCP-POOR / R-CWV-CLS-POOR", () => {
  it("CWV 미측정(cwv undefined)이면 조용히 skip", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.filter((v) => v.category === "cwv")).toHaveLength(0);
  });

  it("known-good: LCP 1000ms, CLS 0.02", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.02, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.filter((v) => v.category === "cwv")).toHaveLength(0);
  });

  it("known-bad: LCP 4000ms(임계값 2500 초과)", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 4000, clsUnitless: 0.02, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CWV-LCP-POOR")).toBe(true);
  });

  it("known-bad: CLS 0.35(임계값 0.1 초과)", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.35, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CWV-CLS-POOR")).toBe(true);
  });
});

describe("R-CWV-TBT-POOR", () => {
  it("known-good: TBT 50ms(데스크톱 임계값 150ms 이하)", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.02, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CWV-TBT-POOR")).toBe(false);
  });

  it("known-bad: TBT 400ms(데스크톱 임계값 150ms 초과)", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.02, inpProxyTbtMs: 400, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    const found = violations.find((v) => v.ruleId === "R-CWV-TBT-POOR");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
    expect(found!.currentValue).toContain("400ms");
  });

  it("CWV 미측정(cwv undefined)이면 조용히 skip", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.some((v) => v.ruleId === "R-CWV-TBT-POOR")).toBe(false);
  });

  it("경계값: TBT 정확히 150ms(임계값과 동일)면 미발화(<=이므로 good)", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.02, inpProxyTbtMs: 150, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CWV-TBT-POOR")).toBe(false);
  });

  it("경계값: TBT 151ms(임계값 1ms 초과)면 발화", () => {
    const ctx = baseCtx({ cwv: { lcpMs: 1000, clsUnitless: 0.02, inpProxyTbtMs: 151, isLabData: true, runsCompleted: 3 } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-CWV-TBT-POOR")).toBe(true);
  });
});

describe("R-QA-STRUCTURE-MISSING", () => {
  it("known-bad: JSON-LD 자체가 없으면 발화", () => {
    const violations = evaluateAllRules(baseCtx());
    expect(violations.some((v) => v.ruleId === "R-QA-STRUCTURE-MISSING")).toBe(true);
  });

  it("known-bad: JSON-LD는 있지만 FAQPage/QAPage가 아니면 발화", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [validJsonLd] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-QA-STRUCTURE-MISSING")).toBe(true);
  });

  it("known-good: FAQPage 타입 JSON-LD가 있으면 미발화", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [validQaJsonLd] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-QA-STRUCTURE-MISSING")).toBe(false);
  });

  it("known-good: QAPage 타입도 인정된다", () => {
    const qaPageJsonLd = '{"@context":"https://schema.org","@type":"QAPage"}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [qaPageJsonLd] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-QA-STRUCTURE-MISSING")).toBe(false);
  });

  it("known-good: @graph 안에 FAQPage가 있어도 인정된다", () => {
    const graphJsonLd = '{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"FAQPage"}]}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [graphJsonLd] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-QA-STRUCTURE-MISSING")).toBe(false);
  });
});

describe("R-JSONLD-PRODUCT-INCOMPLETE", () => {
  it("known-good: Product 타입이 아니면(예: WebPage) 미발화", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [validJsonLd] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-INCOMPLETE")).toBe(false);
  });

  it("known-good: Product 타입에 name+offers가 모두 있으면 미발화", () => {
    const completeProduct = '{"@context":"https://schema.org","@type":"Product","name":"신발","offers":{"@type":"Offer","price":"10000"}}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [completeProduct] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-INCOMPLETE")).toBe(false);
  });

  it("known-bad: Product 타입인데 name이 없으면 발화", () => {
    const noNameProduct = '{"@context":"https://schema.org","@type":"Product","offers":{"@type":"Offer","price":"10000"}}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [noNameProduct] } });
    const violations = evaluateAllRules(ctx);
    const found = violations.find((v) => v.ruleId === "R-JSONLD-PRODUCT-INCOMPLETE");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("medium");
  });

  it("known-bad: Product 타입인데 review/aggregateRating/offers가 전부 없으면 발화", () => {
    const noOffersProduct = '{"@context":"https://schema.org","@type":"Product","name":"신발"}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [noOffersProduct] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-INCOMPLETE")).toBe(true);
  });

  it("known-good: offers 대신 aggregateRating만 있어도 인정된다", () => {
    const ratedProduct = '{"@context":"https://schema.org","@type":"Product","name":"신발","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.5","reviewCount":"10"}}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [ratedProduct] } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-INCOMPLETE")).toBe(false);
  });
});

describe("R-JSONLD-PRODUCT-NAME-MISMATCH", () => {
  it("known-good: Product 타입이 아니면(예: WebPage) 미발화", () => {
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [validJsonLd], bodyText: "아무 상관없는 본문" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("known-good: name이 본문에 그대로 등장하면 미발화", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"러닝화 프로 X"}';
    const ctx = baseCtx({
      renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "이 러닝화 프로 X는 최고의 신발입니다" },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("known-good: 대소문자가 달라도 일치로 인정된다(대소문자 무관 비교)", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"Running Shoe Pro"}';
    const ctx = baseCtx({
      renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "이 페이지는 running shoe pro 상품입니다" },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("known-bad: name이 본문 어디에도 없으면 high severity로 발화", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"전혀 다른 상품명"}';
    const ctx = baseCtx({
      renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "이 페이지는 완전히 다른 내용을 담고 있습니다" },
    });
    const violations = evaluateAllRules(ctx);
    const found = violations.find((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH");
    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
  });

  it("엣지: bodyText가 비어있으면(파싱 실패 등) 판단 근거가 없어 fail-closed로 미발화", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"어떤 상품"}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("엣지: name 필드 자체가 없으면(다른 규칙 R-JSONLD-PRODUCT-INCOMPLETE 소관) 미발화", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","offers":{"@type":"Offer","price":"10000"}}';
    const ctx = baseCtx({ renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "아무 본문" } });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("엣지: 404 페이지는 미발화(status 게이트)", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"상품"}';
    const ctx = baseCtx({
      statusCode: 404,
      renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "전혀 다른 내용" },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });

  it("price/offers는 검사 대상이 아니다(포맷 차이로 인한 오탐 방지 설계) — price가 안 보여도 미발화", () => {
    const product = '{"@context":"https://schema.org","@type":"Product","name":"상품","offers":{"@type":"Offer","price":"10000"}}';
    const ctx = baseCtx({
      renderedSignals: { ...emptySignals, jsonLdBlocks: [product], bodyText: "이 상품은 10,000원입니다(쉼표 포맷 차이)" },
    });
    const violations = evaluateAllRules(ctx);
    expect(violations.some((v) => v.ruleId === "R-JSONLD-PRODUCT-NAME-MISMATCH")).toBe(false);
  });
});

describe("종합: known-good/known-bad 픽스처 세트 (성공기준 검증)", () => {
  it("known-good 픽스처 8종은 오탐 0", () => {
    const ogComplete = { ogTitle: "t", ogUrl: "x", ogDescription: "d", metaDescription: "d" };
    // title/h1MissingRule/h1MultipleRule 도입(Phase 2 Stage 4) 이후로는 "결함 없는 페이지"가 되려면
    // title·h1도 채워야 한다 — 301 픽스처(status 게이트로 애초에 미평가)만 예외.
    const contentComplete = { title: "예시 페이지 제목", h1Count: 1, h1Text: "예시 페이지 제목" };
    const goodFixtures: RuleContext[] = [
      baseCtx({
        rawSignals: { ...emptySignals, canonical: "https://example.com/", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
        renderedSignals: { ...emptySignals, canonical: "https://example.com/", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
      }),
      baseCtx({
        statusCode: 200,
        rawSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
        renderedSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
      }),
      baseCtx({ statusCode: 301, rawSignals: { ...emptySignals, canonical: "x" }, renderedSignals: { ...emptySignals, canonical: "x" } }),
      baseCtx({
        redirectChain: ["https://example.com/old"],
        rawSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
        renderedSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
      }),
      baseCtx({
        rawSignals: { ...emptySignals, canonical: "x", metaRobots: "index", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
        renderedSignals: { ...emptySignals, canonical: "x", metaRobots: "index", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
      }),
      baseCtx({
        cwv: { lcpMs: 1200, clsUnitless: 0.01, inpProxyTbtMs: 10, isLabData: true, runsCompleted: 3 },
        rawSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
        renderedSignals: { ...emptySignals, canonical: "x", jsonLdBlocks: [validJsonLd, validQaJsonLd], ...ogComplete, ...contentComplete },
      }),
    ];
    for (const ctx of goodFixtures) {
      // R-CANONICAL-MISSING을 제외한 카테고리만 본다(위 픽스처들은 canonical 값을 명시적으로 세팅함) — 순수 오탐 검사
      const violations = evaluateAllRules(ctx);
      expect(violations, `unexpected violations for ${JSON.stringify(ctx)}`).toEqual([]);
    }
  });

  it("known-bad 픽스처 8종 중 ≥90% 탐지(재현율)", () => {
    const badFixtures: { ctx: RuleContext; expectedRuleId: string }[] = [
      { ctx: baseCtx(), expectedRuleId: "R-CANONICAL-MISSING" },
      { ctx: baseCtx({ renderedSignals: { ...emptySignals, canonical: "x" } }), expectedRuleId: "R-CANONICAL-JS-ONLY" },
      { ctx: baseCtx({ renderedSignals: { ...emptySignals, metaRobots: "noindex" } }), expectedRuleId: "R-NOINDEX-DETECTED" },
      { ctx: baseCtx({ statusCode: 404 }), expectedRuleId: "R-STATUS-4XX" },
      { ctx: baseCtx({ statusCode: 500 }), expectedRuleId: "R-STATUS-5XX" },
      { ctx: baseCtx({ redirectChain: ["a", "b"] }), expectedRuleId: "R-REDIRECT-CHAIN-LONG" },
      { ctx: baseCtx({ renderedSignals: { ...emptySignals, title: "t" } }), expectedRuleId: "R-RAW-RENDERED-GAP-TITLE" },
      { ctx: baseCtx({ cwv: { lcpMs: 5000, clsUnitless: 0, inpProxyTbtMs: 0, isLabData: true, runsCompleted: 3 } }), expectedRuleId: "R-CWV-LCP-POOR" },
    ];
    let detected = 0;
    for (const { ctx, expectedRuleId } of badFixtures) {
      const violations = evaluateAllRules(ctx);
      if (violations.some((v) => v.ruleId === expectedRuleId)) detected++;
    }
    const recall = detected / badFixtures.length;
    expect(recall).toBeGreaterThanOrEqual(0.9);
  });
});
