import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedIP,
  assertSafeUrl,
  resolveAndCheck,
  createSsrfSafeLookup,
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

  // 2026-10-11 발견: WHATWG URL 파서는 http://[::ffff:127.0.0.1]/ 의 호스트를 16진 표기 [::ffff:7f00:1]로
  // 정규화하는데, 옛 판정은 점 표기(::ffff:127.0.0.1)만 알아봐 loopback·클라우드 메타데이터가 통과했다.
  // 같은 주소의 다른 표기(전개형·IPv4 호환·NAT64·6to4)도 내장된 IPv4로 판정해야 한다.
  const blockedIPv6Variants = [
    "::ffff:7f00:1", // IPv4-매핑 loopback(16진 — URL 파서가 만드는 형태)
    "::ffff:a9fe:a9fe", // IPv4-매핑 클라우드 메타데이터(16진)
    "::ffff:a00:1", // IPv4-매핑 10.0.0.1
    "0:0:0:0:0:0:0:1", // 전개형 loopback
    "0:0:0:0:0:ffff:7f00:1", // 전개형 매핑 loopback
    "::127.0.0.1", // IPv4 호환(폐기된 형식) loopback
    "::", // 미지정 주소
    "64:ff9b::7f00:1", // NAT64 → 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64 → 메타데이터
    "2002:7f00:1::", // 6to4 → 127.0.0.1
    "2002:a9fe:a9fe::1", // 6to4 → 메타데이터
    "fe80::1%eth0", // zone id가 붙은 링크로컬
    "fec0::1", // 사이트 로컬(폐기됨)
    "ff02::1", // 멀티캐스트
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo
    "2001:db8::1", // 문서용
  ];

  it.each(blockedIPv6Variants)("IPv6 표기 변형도 내장 IPv4/예약대역으로 판정해 차단: %s", (ip) => {
    expect(isPrivateOrReservedIP(ip)).toBe(true);
  });

  const allowedPublic = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "::ffff:808:808", // IPv4-매핑이지만 내장 IPv4가 공인(8.8.8.8) — 과차단 방지
    "64:ff9b::808:808", // NAT64 → 8.8.8.8
    "2002:808:808::", // 6to4 → 8.8.8.8
    "2a00:1450:4001:81b::200e", // 일반 공인 IPv6
  ];

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
