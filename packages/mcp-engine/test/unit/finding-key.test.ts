import { describe, it, expect } from "vitest";
import { normalizeUrl, computeFindingKey } from "../../src/regression/finding-key.js";

describe("normalizeUrl", () => {
  it("fragment 제거", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
  });

  it("호스트 대소문자 무관", () => {
    expect(normalizeUrl("https://EXAMPLE.com/page")).toBe(normalizeUrl("https://example.com/page"));
  });

  it("트레일링 슬래시 통일(루트는 예외)", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe(normalizeUrl("https://example.com/page"));
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("기본 포트(443/80) 제거", () => {
    expect(normalizeUrl("https://example.com:443/page")).toBe(normalizeUrl("https://example.com/page"));
    expect(normalizeUrl("http://example.com:80/page")).toBe(normalizeUrl("http://example.com/page"));
  });

  it("쿼리스트링은 유지(다른 쿼리=다른 페이지)", () => {
    expect(normalizeUrl("https://example.com/page?a=1")).not.toBe(normalizeUrl("https://example.com/page?a=2"));
  });
});

describe("computeFindingKey — 안정 매칭키", () => {
  it("같은 입력은 항상 같은 키(결정적)", () => {
    const k1 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 1);
    const k2 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 1);
    expect(k1).toBe(k2);
  });

  it("URL만 다르면(정규화 후 같으면) 같은 키 — trailing slash 변형", () => {
    const k1 = computeFindingKey("https://example.com/page/", "R-CANONICAL-MISSING", 1);
    const k2 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 1);
    expect(k1).toBe(k2);
  });

  it("rule_id가 다르면 다른 키", () => {
    const k1 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 1);
    const k2 = computeFindingKey("https://example.com/page", "R-NOINDEX-DETECTED", 1);
    expect(k1).not.toBe(k2);
  });

  it("rule_version이 다르면 다른 키(규칙 변경 시 베이스라인 무효화 의도)", () => {
    const k1 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 1);
    const k2 = computeFindingKey("https://example.com/page", "R-CANONICAL-MISSING", 2);
    expect(k1).not.toBe(k2);
  });

  it("페이지가 다르면 다른 키", () => {
    const k1 = computeFindingKey("https://example.com/a", "R-CANONICAL-MISSING", 1);
    const k2 = computeFindingKey("https://example.com/b", "R-CANONICAL-MISSING", 1);
    expect(k1).not.toBe(k2);
  });
});
