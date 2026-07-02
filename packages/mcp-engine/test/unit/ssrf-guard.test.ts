import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedIP,
  assertSafeUrl,
  resolveAndCheck,
  SsrfBlockedError,
} from "../../src/crawler/ssrf-guard.js";

describe("isPrivateOrReservedIP — 트랩 IP 세트", () => {
  const blockedIPv4 = [
    "127.0.0.1", // 루프백
    "169.254.169.254", // 클라우드 메타데이터
    "10.0.0.1", // 사설 10/8
    "172.16.0.1", // 사설 172.16/12
    "172.31.255.255", // 사설 172.16/12 상한
    "192.168.1.1", // 사설 192.168/16
    "0.0.0.0", // 이 네트워크
    "100.64.0.1", // CGNAT
    "255.255.255.255", // 브로드캐스트
  ];

  it.each(blockedIPv4)("IPv4 사설/예약대역 차단: %s", (ip) => {
    expect(isPrivateOrReservedIP(ip)).toBe(true);
  });

  const blockedIPv6 = [
    "::1", // 루프백
    "fe80::1", // 링크로컬
    "fc00::1", // ULA
    "fd00::1", // ULA
    "::ffff:127.0.0.1", // IPv4-매핑 루프백
    "::ffff:169.254.169.254", // IPv4-매핑 메타데이터
  ];

  it.each(blockedIPv6)("IPv6 사설/예약대역 차단: %s", (ip) => {
    expect(isPrivateOrReservedIP(ip)).toBe(true);
  });

  const allowedPublic = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"];

  it.each(allowedPublic)("공인 IP는 통과: %s", (ip) => {
    expect(isPrivateOrReservedIP(ip)).toBe(false);
  });

  it("isIP가 인식하지 못하는 이상한 표기(8진수/정수)는 안전 측 차단", () => {
    // node:net.isIP()는 "0177.0.0.1"(8진수 시도) 같은 표기를 유효 IPv4로 인정하지 않음 → fail-closed
    expect(isPrivateOrReservedIP("0177.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIP("2130706433")).toBe(true); // 127.0.0.1의 정수 표기
    expect(isPrivateOrReservedIP("not-an-ip")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("http/https는 허용", () => {
    expect(() => assertSafeUrl("https://example.com/")).not.toThrow();
    expect(() => assertSafeUrl("http://example.com/")).not.toThrow();
  });

  it("file:// 스킴은 차단", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(SsrfBlockedError);
  });

  it("ftp:// 스킴은 차단", () => {
    expect(() => assertSafeUrl("ftp://example.com/")).toThrow(SsrfBlockedError);
  });

  it("IP 리터럴로 직접 사설 주소 접근 시 차단", () => {
    expect(() => assertSafeUrl("http://127.0.0.1/")).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/")).toThrow(SsrfBlockedError);
  });

  it("유효하지 않은 URL 문자열은 차단", () => {
    expect(() => assertSafeUrl("not a url")).toThrow(SsrfBlockedError);
  });
});

describe("resolveAndCheck — 실제 DNS 조회(네트워크 필요)", () => {
  it("localhost는 사설 IP로 해석되어 차단된다", async () => {
    await expect(resolveAndCheck("localhost")).rejects.toThrow(SsrfBlockedError);
  });

  it("example.com은 공인 IP로 해석되어 통과한다", async () => {
    const result = await resolveAndCheck("example.com");
    expect(result.hostname).toBe("example.com");
    expect(isPrivateOrReservedIP(result.resolvedIP)).toBe(false);
  });
});
