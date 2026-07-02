import { describe, it, expect } from "vitest";
import { classifyRegressions } from "../../src/regression/classify.js";
import type { FindingRecord } from "../../src/db/repositories/finding.js";
import type { BaselineSnapshot } from "../../src/db/repositories/baseline.js";

function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 1,
    finding_key: "k1",
    audit_run_id: 1,
    category: "canonical",
    rule_id: "R-CANONICAL-MISSING",
    rule_version: 1,
    severity: "high",
    page_url: "https://example.com/",
    current_value: null,
    recommended_value: null,
    status: "open",
    ...overrides,
  };
}

describe("classifyRegressions", () => {
  it("베이스라인에 없던 finding_key가 나타나면 회귀(regression)로 분류", () => {
    const baseline: BaselineSnapshot = {};
    const current = [makeFinding({ finding_key: "k1" })];
    const result = classifyRegressions(current, baseline);
    expect(result.revertedKeys).toEqual(["k1"]);
    expect(result.classification.k1).toBe("regression");
  });

  it("베이스라인에 이미 있던(open) finding_key는 회귀 목록에서 제외(중복 알림 방지)", () => {
    const baseline: BaselineSnapshot = { k1: { category: "canonical", severity: "high", status: "open" } };
    const current = [makeFinding({ finding_key: "k1", status: "open" })];
    const result = classifyRegressions(current, baseline);
    expect(result.revertedKeys).toEqual([]);
  });

  it("베이스라인에 acknowledged로 있던 finding_key가 재발해도 회귀 목록에서 제외", () => {
    const baseline: BaselineSnapshot = { k1: { category: "canonical", severity: "high", status: "acknowledged" } };
    const current = [makeFinding({ finding_key: "k1", status: "acknowledged" })];
    const result = classifyRegressions(current, baseline);
    expect(result.revertedKeys).toEqual([]);
  });

  it("새로 나타났지만 현재 status가 이미 acknowledged면 intended로 분류(그래도 목록엔 포함)", () => {
    const baseline: BaselineSnapshot = {};
    const current = [makeFinding({ finding_key: "k1", status: "acknowledged" })];
    const result = classifyRegressions(current, baseline);
    expect(result.revertedKeys).toEqual(["k1"]);
    expect(result.classification.k1).toBe("intended");
  });

  it("여러 finding 중 일부만 회귀", () => {
    const baseline: BaselineSnapshot = { k_old: { category: "meta", severity: "low", status: "open" } };
    const current = [makeFinding({ finding_key: "k_old" }), makeFinding({ finding_key: "k_new", id: 2 })];
    const result = classifyRegressions(current, baseline);
    expect(result.revertedKeys).toEqual(["k_new"]);
  });

  it("현재 finding이 하나도 없으면 회귀도 없음", () => {
    const result = classifyRegressions([], { k1: { category: "x", severity: "high", status: "open" } });
    expect(result.revertedKeys).toEqual([]);
  });
});
