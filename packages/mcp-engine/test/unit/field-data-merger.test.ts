import { describe, it, expect } from "vitest";
import { mergeFieldData } from "../../src/integrations/field-data-merger.js";
import type { PageReportInput } from "../../src/report/types.js";
import type { PsiFieldData } from "../../src/integrations/types.js";

function makeSamplePage(): PageReportInput {
  return {
    url: "https://my-site.com/",
    statusCode: 200,
    violations: [
      {
        ruleId: "R-CANONICAL-MISSING",
        ruleVersion: 1,
        category: "canonical",
        severity: "high",
        pageUrl: "https://my-site.com/",
        currentValue: null,
        recommendedValue: "self-canonical 추가",
      },
    ],
    cwv: {
      lcpMs: 1800,
      clsUnitless: 0.02,
      inpProxyTbtMs: 120,
      isLabData: true,
      runsCompleted: 3,
    },
  };
}

const sampleFieldData: PsiFieldData = {
  url: "https://my-site.com/",
  lcpMs: 2400,
  clsUnitless: 0.08,
  inpMs: 210,
  isFieldData: true,
};

describe("mergeFieldData — 순수 함수, field(CrUX) 데이터를 리포트에 추가 방식(additive)으로 결합", () => {
  it("field 데이터가 있으면 명확히 라벨링된 fieldData 섹션이 추가된다", () => {
    const page = makeSamplePage();
    const result = mergeFieldData(page, sampleFieldData);

    expect(result.fieldData).toBeDefined();
    expect(result.fieldData?.isFieldData).toBe(true);
    expect(result.fieldData?.lcpMs).toBe(2400);
    expect(result.fieldData?.clsUnitless).toBe(0.08);
    expect(result.fieldData?.inpMs).toBe(210);
    expect(result.fieldData?.note).toMatch(/field/i);
  });

  it("field 데이터를 추가해도 기존 lab-CWV·violations·url·statusCode는 바뀌지 않는다(byte-for-byte 보존)", () => {
    const page = makeSamplePage();
    const before = JSON.stringify(page);

    const result = mergeFieldData(page, sampleFieldData);

    expect(JSON.stringify(page)).toBe(before); // 원본 객체 자체는 절대 변형(mutate)되지 않음
    expect(result.url).toBe(page.url);
    expect(result.statusCode).toBe(page.statusCode);
    expect(result.violations).toEqual(page.violations);
    expect(result.violations).toBe(page.violations); // 같은 배열 참조 — 재생성/변형 없음
    expect(result.cwv).toEqual(page.cwv);
    expect(result.cwv).toBe(page.cwv); // 같은 객체 참조 — lab 데이터 그대로 보존
  });

  it("field 데이터가 null이면 fieldData 섹션 없이 원본과 동일한 리포트를 반환한다(빈 섹션 생성 금지)", () => {
    const page = makeSamplePage();
    const result = mergeFieldData(page, null);

    expect(result.fieldData).toBeUndefined();
    expect(result).toEqual(page);
  });

  it("field 데이터가 undefined(미조회)여도 동일하게 원본을 그대로 반환한다", () => {
    const page = makeSamplePage();
    const result = mergeFieldData(page, undefined);

    expect(result.fieldData).toBeUndefined();
    expect(result).toEqual(page);
  });

  it("lab 값과 field 값이 다른 경우에도 둘 다 각자의 라벨을 유지한 채 공존한다(혼동 방지가 핵심 요구사항)", () => {
    const page = makeSamplePage();
    const result = mergeFieldData(page, sampleFieldData);

    expect(result.cwv?.isLabData).toBe(true);
    expect(result.fieldData?.isFieldData).toBe(true);
    expect(result.cwv?.lcpMs).not.toBe(result.fieldData?.lcpMs); // 실제로 lab≠field 값임을 확인
  });
});
