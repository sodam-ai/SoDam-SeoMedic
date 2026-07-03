import { describe, it, expect } from "vitest";
import { evaluateRepoPolicy } from "../../src/github/policy.js";

const BASE = { isArchived: false, isDisabled: false, hasLicense: true, hasContributing: true };

describe("evaluateRepoPolicy", () => {
  it("archived 저장소는 차단한다", () => {
    const result = evaluateRepoPolicy({ ...BASE, isArchived: true });
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toContain("archived");
  });

  it("disabled 저장소는 차단한다", () => {
    const result = evaluateRepoPolicy({ ...BASE, isDisabled: true });
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toContain("disabled");
  });

  it("LICENSE/CONTRIBUTING이 없어도 차단하지 않고 경고만 한다", () => {
    const result = evaluateRepoPolicy({ ...BASE, hasLicense: false, hasContributing: false });
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });

  it("전부 정상이면 허용하고 경고 없음", () => {
    const result = evaluateRepoPolicy(BASE);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.blockReason).toBeNull();
  });
});
