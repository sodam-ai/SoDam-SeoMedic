import { describe, it, expect } from "vitest";
import { findFixerDescriptor } from "../../src/fixers/registry.js";

// 회귀가드: canonical fixer는 "순수 추가"처럼 보여도 절대 add_safe로 완화되면 안 된다
// (04_PROJECT_SPEC "canonical은 예외 없이 gated" 결정 — 누군가 나중에 실수로 완화하는 것을 방지).
describe("fixer registry — R-CANONICAL-MISSING는 항상 gated", () => {
  it("risk_level이 gated로 등록되어 있다", () => {
    expect(findFixerDescriptor("R-CANONICAL-MISSING")?.riskLevel).toBe("gated");
  });

  it("R-CANONICAL-JS-ONLY도 gated로 등록되어 있다(critical severity — 절대 add_safe로 완화 금지)", () => {
    expect(findFixerDescriptor("R-CANONICAL-JS-ONLY")?.riskLevel).toBe("gated");
  });

  it("R-SITEMAP-MISSING-URL은 기존대로 add_safe를 유지한다(회귀 확인)", () => {
    expect(findFixerDescriptor("R-SITEMAP-MISSING-URL")?.riskLevel).toBe("add_safe");
  });

  it("등록되지 않은 rule_id는 undefined를 반환한다", () => {
    expect(findFixerDescriptor("R-NOT-REGISTERED")).toBeUndefined();
  });

  it("R-OG-BASIC-MISSING도 gated로 등록되어 있다(PRD 04:71 표의 add_safe를 따르지 않고 canonical과 동일한 표시-영향 오버라이드 적용)", () => {
    expect(findFixerDescriptor("R-OG-BASIC-MISSING")?.riskLevel).toBe("gated");
  });

  it("R-NOINDEX-DETECTED도 gated로 등록되어 있다(색인 통제=예외 없이 gated)", () => {
    expect(findFixerDescriptor("R-NOINDEX-DETECTED")?.riskLevel).toBe("gated");
  });

  it("R-JSONLD-WEBSITE-MISSING도 gated로 등록되어 있다(구조화 데이터 추가=예외 없이 gated)", () => {
    expect(findFixerDescriptor("R-JSONLD-WEBSITE-MISSING")?.riskLevel).toBe("gated");
  });

  it("R-TITLE-MISSING도 gated로 등록되어 있다(CTR/랭킹 신호=예외 없이 gated, 04_PROJECT_SPEC:98)", () => {
    expect(findFixerDescriptor("R-TITLE-MISSING")?.riskLevel).toBe("gated");
  });
});
