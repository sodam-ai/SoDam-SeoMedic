import { describe, it, expect } from "vitest";
import { median, measureCoreWebVitals } from "../../src/cwv/lighthouse-runner.js";
import { SsrfBlockedError } from "../../src/crawler/ssrf-guard.js";

describe("median — 순수 로직(네트워크 불필요)", () => {
  it("빈 배열은 null", () => {
    expect(median([])).toBeNull();
  });

  it("홀수 개는 가운데 값", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("짝수 개는 가운데 두 값의 평균", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("NaN/비정상 값은 걸러내고 계산", () => {
    expect(median([1, NaN, 3])).toBe(2);
  });
});

describe("measureCoreWebVitals — 진입 SSRF 가드(네트워크 불필요)", () => {
  it("사설 IP 리터럴은 브라우저 실행 전에 즉시 차단", async () => {
    await expect(measureCoreWebVitals("http://127.0.0.1:9/x")).rejects.toThrow(SsrfBlockedError);
  });
});

describe("measureCoreWebVitals — 실제 Lighthouse 측정(느림, 실제 브라우저+CDP)", () => {
  it("example.com의 LCP/CLS/TBT를 실제로 측정해 중앙값을 낸다", async () => {
    const result = await measureCoreWebVitals("https://example.com/", 2);
    expect(result.runsCompleted).toBe(2);
    expect(result.isLabData).toBe(true);
    expect(result.lcpMs).not.toBeNull();
    expect(result.lcpMs!).toBeGreaterThan(0);
    expect(result.clsUnitless).not.toBeNull();
    expect(result.clsUnitless!).toBeGreaterThanOrEqual(0);
    expect(result.inpProxyTbtMs).not.toBeNull();
    expect(result.inpProxyTbtMs!).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
