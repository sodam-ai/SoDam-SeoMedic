import { describe, it, expect } from "vitest";
import { buildFixBranchName, buildPrContent } from "../../src/github/pr-builder.js";
import type { FixRecord } from "../../src/db/repositories/fix.js";
import type { FindingRecord } from "../../src/db/repositories/finding.js";

function makeFix(overrides: Partial<FixRecord> = {}): FixRecord {
  return {
    id: 1,
    finding_id: 1,
    fix_type: "pr",
    risk_level: "add_safe",
    target_path: "app/sitemap.ts",
    dry_run_diff: '+ { url: "https://example.com/about" }',
    validation: null,
    idempotency_marker: null,
    approval_status: "auto",
    applied_at: null,
    backup_path: null,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 1,
    finding_key: "abc123",
    audit_run_id: 1,
    category: "indexing",
    rule_id: "R-SITEMAP-MISSING-URL",
    rule_version: 1,
    severity: "medium",
    page_url: "https://example.com/about",
    current_value: null,
    recommended_value: "sitemap에 추가",
    status: "open",
    ...overrides,
  };
}

describe("buildFixBranchName", () => {
  it("rule_id를 소문자·하이픈으로 정규화한 결정론적 브랜치명을 만든다", () => {
    expect(buildFixBranchName("R-SITEMAP-MISSING-URL")).toBe("seomedic/fix-r-sitemap-missing-url");
  });

  it("같은 rule_id는 항상 같은 브랜치명을 반환한다(중복 방지의 전제)", () => {
    const a = buildFixBranchName("R-SITEMAP-MISSING-URL");
    const b = buildFixBranchName("R-SITEMAP-MISSING-URL");
    expect(a).toBe(b);
  });

  it("seomedic/ 접두사를 가져 git-ops.ts의 assertSafeBranchName을 통과한다", () => {
    expect(buildFixBranchName("R-X")).toMatch(/^seomedic\//);
  });
});

describe("buildPrContent", () => {
  it("단일 fix면 rule_id를 포함한 제목을 만든다", () => {
    const { title } = buildPrContent([{ fix: makeFix(), finding: makeFinding() }]);
    expect(title).toContain("R-SITEMAP-MISSING-URL");
  });

  it("여러 fix면 개수를 포함한 제목을 만든다", () => {
    const { title } = buildPrContent([
      { fix: makeFix(), finding: makeFinding() },
      { fix: makeFix({ id: 2 }), finding: makeFinding({ id: 2, rule_id: "R-OTHER" }) },
    ]);
    expect(title).toContain("2건");
  });

  it("본문에 안전 경고(add_safe도 무해하지 않음)와 자동머지 안 함 문구가 포함된다", () => {
    const { body } = buildPrContent([{ fix: makeFix(), finding: makeFinding() }]);
    expect(body).toContain("무해함을 보장하지 않습니다");
    expect(body).toContain("자동 머지도 하지 않았습니다");
  });

  it("본문에 각 fix의 rule_id·페이지·대상 파일이 나열된다", () => {
    const { body } = buildPrContent([{ fix: makeFix(), finding: makeFinding() }]);
    expect(body).toContain("R-SITEMAP-MISSING-URL");
    expect(body).toContain("https://example.com/about");
    expect(body).toContain("app/sitemap.ts");
  });
});
