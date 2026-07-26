import { describe, it, expect } from "vitest";
import { buildJsonReport, JsonReportSchema } from "../../src/report/json.js";
import { buildMarkdownReport } from "../../src/report/markdown.js";
import type { AuditReportInput } from "../../src/report/types.js";
import type { RuleViolation } from "../../src/rules/types.js";

const GENERATED_AT = "2026-07-03T00:00:00.000Z";

function violation(overrides: Partial<RuleViolation> = {}): RuleViolation {
  return {
    ruleId: "R-CANONICAL-MISSING",
    ruleVersion: 1,
    category: "canonical",
    severity: "high",
    pageUrl: "https://example.com/",
    currentValue: null,
    recommendedValue: "self-canonical 추가",
    ...overrides,
  };
}

describe("buildJsonReport", () => {
  it("위반이 없으면 overallLabel=양호, 스키마 통과", () => {
    const input: AuditReportInput = { target: "https://example.com", generatedAt: GENERATED_AT, pages: [{ url: "https://example.com/", statusCode: 200, violations: [] }] };
    const report = buildJsonReport(input);
    expect(report.overallLabel).toBe("양호");
    expect(() => JsonReportSchema.parse(report)).not.toThrow();
  });

  it("critical 위반이 있으면 overallLabel=위험", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [{ url: "https://example.com/", statusCode: 200, violations: [violation({ severity: "critical" })] }],
    };
    expect(buildJsonReport(input).overallLabel).toBe("위험");
  });

  it("high까지만 있으면 overallLabel=주의(critical 없음)", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [{ url: "https://example.com/", statusCode: 200, violations: [violation({ severity: "high" })] }],
    };
    expect(buildJsonReport(input).overallLabel).toBe("주의");
  });

  it("violations가 임팩트 순(critical→high→medium→low)으로 정렬된다", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [
        {
          url: "https://example.com/",
          statusCode: 200,
          violations: [
            violation({ ruleId: "R-LOW", severity: "low" }),
            violation({ ruleId: "R-CRIT", severity: "critical" }),
            violation({ ruleId: "R-MED", severity: "medium" }),
          ],
        },
      ],
    };
    const report = buildJsonReport(input);
    expect(report.pages[0].violations.map((v) => v.ruleId)).toEqual(["R-CRIT", "R-MED", "R-LOW"]);
  });

  it("CWV가 있으면 lab≠field 안내 문구를 포함한다", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [
        {
          url: "https://example.com/",
          statusCode: 200,
          violations: [],
          cwv: { lcpMs: 1200, clsUnitless: 0.02, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 },
        },
      ],
    };
    const report = buildJsonReport(input);
    expect(report.pages[0].cwv?.note).toContain("field");
    expect(report.pages[0].cwv?.note).toContain("CrUX");
  });

  it("JSON에 숫자 절대점수(overallScore 등) 필드가 존재하지 않는다", () => {
    const input: AuditReportInput = { target: "https://example.com", generatedAt: GENERATED_AT, pages: [] };
    const report = buildJsonReport(input) as unknown as Record<string, unknown>;
    expect(report.overallScore).toBeUndefined();
    expect(report.score).toBeUndefined();
  });
});

describe("buildMarkdownReport", () => {
  it("절대 숫자 점수 없이 라벨만 포함한다", () => {
    const input: AuditReportInput = { target: "https://example.com", generatedAt: GENERATED_AT, pages: [] };
    const md = buildMarkdownReport(input);
    expect(md).toContain("양호");
    expect(md).toContain("참고용 라벨");
  });

  it("위반이 없으면 '위반 사항 없음' 문구", () => {
    const input: AuditReportInput = { target: "https://example.com", generatedAt: GENERATED_AT, pages: [{ url: "https://example.com/", statusCode: 200, violations: [] }] };
    expect(buildMarkdownReport(input)).toContain("위반 사항 없음");
  });

  it("진단 페이지가 0개면 '양호'와 별개로 접속 실패 가능성 경고를 포함한다(실사용 검증에서 발견: 존재하지 않는 도메인 진단 시 '양호'만 보이면 오해 소지)", () => {
    const input: AuditReportInput = { target: "https://this-domain-should-not-exist.invalid", generatedAt: GENERATED_AT, pages: [] };
    const md = buildMarkdownReport(input);
    expect(md).toContain("양호"); // 기존 라벨 동작은 유지(하위 호환)
    expect(md).toContain("페이지 자체를 찾지 못했다");
  });

  it("진단 페이지가 1개 이상이면 접속 실패 경고를 붙이지 않는다(정상 케이스 오탐 방지)", () => {
    const input: AuditReportInput = { target: "https://example.com", generatedAt: GENERATED_AT, pages: [{ url: "https://example.com/", statusCode: 200, violations: [] }] };
    expect(buildMarkdownReport(input)).not.toContain("페이지 자체를 찾지 못했다");
  });

  it("CWV 섹션에 lab/field 구분 경고를 포함한다", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [
        {
          url: "https://example.com/",
          statusCode: 200,
          violations: [],
          cwv: { lcpMs: 1200, clsUnitless: 0.02, inpProxyTbtMs: 50, isLabData: true, runsCompleted: 3 },
        },
      ],
    };
    const md = buildMarkdownReport(input);
    expect(md).toContain("lab");
    expect(md).toContain("CrUX");
  });

  it("테이블 셀의 파이프 문자를 이스케이프한다(마크다운 표 깨짐 방지)", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [
        {
          url: "https://example.com/",
          statusCode: 200,
          violations: [violation({ currentValue: "a | b", recommendedValue: null })],
        },
      ],
    };
    const md = buildMarkdownReport(input);
    expect(md).toContain("a \\| b");
  });

  it("여러 위반이 임팩트 순으로 표에 나열된다", () => {
    const input: AuditReportInput = {
      target: "https://example.com",
      generatedAt: GENERATED_AT,
      pages: [
        {
          url: "https://example.com/",
          statusCode: 200,
          violations: [violation({ ruleId: "R-LOW", severity: "low" }), violation({ ruleId: "R-CRIT", severity: "critical" })],
        },
      ],
    };
    const md = buildMarkdownReport(input);
    expect(md.indexOf("R-CRIT")).toBeLessThan(md.indexOf("R-LOW"));
  });
});
