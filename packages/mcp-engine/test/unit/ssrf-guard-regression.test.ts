import { describe, it, expect, vi, beforeEach } from "vitest";

// node:dns를 가짜로 바꿔 "어떤 주소로 해석되는가"를 결정적으로 통제한다(실제 DNS·네트워크 불필요).
// 기존 ssrf-guard.test.ts는 실제 DNS(localhost·example.com)를 쓰므로, 모킹이 섞이지 않게 별도 파일로 둔다.
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock("node:dns", () => ({ lookup: lookupMock }));

import { assertSafeUrl, createSsrfSafeLookup, SsrfBlockedError } from "../../src/crawler/ssrf-guard.js";

type LookupFn = ReturnType<typeof createSsrfSafeLookup>;
type Entry = { address: string; family: number };

/** 가짜 DNS가 돌려줄 주소를 정한다. { all: true } 요청이면 배열, 아니면 첫 주소 하나를 돌려준다. */
function resolvesTo(...entries: Entry[]): void {
  lookupMock.mockImplementation(
    (_host: string, options: { all?: boolean } | number, cb: (...args: unknown[]) => void) => {
      if (typeof options === "object" && options.all) cb(null, entries, undefined);
      else cb(null, entries[0].address, entries[0].family);
    },
  );
}

/** 가드가 만든 lookup을 한 번 호출하고, 콜백이 몇 번 불렸는지까지 돌려준다(중복 호출 방지 검증용). */
function callLookup(lookup: LookupFn, options: Parameters<LookupFn>[1] = {}) {
  return new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; calls: number }>((resolve) => {
    let calls = 0;
    lookup("victim.example.test", options, (err, address) => {
      calls += 1;
      // 같은 틱에 콜백이 두 번 불리는 결함을 잡으려고 한 틱 더 기다린 뒤 결과를 확정한다
      setTimeout(() => resolve({ err, address, calls }), 0);
    });
  });
}

beforeEach(() => {
  lookupMock.mockReset();
});

// 2026-10-11 발견·2026-10-12 수정(da7f4c5): WHATWG URL 파서는 IPv6 호스트를 대괄호째 `[::1]`로 돌려주는데,
// 옛 코드는 대괄호를 벗기지 않고 isIP()에 넘겨 IP 리터럴로 인식하지 못해 사설 IPv6 주소가 통과했다.
describe("assertSafeUrl — 대괄호가 붙은 IPv6 URL (회귀 방지)", () => {
  it("전제 확인: 이 Node의 URL 파서는 IPv6 hostname에 대괄호를 붙여 돌려준다", () => {
    expect(new URL("http://[::1]/").hostname).toBe("[::1]");
  });

  const blockedUrls = [
    "http://[::1]/", // 루프백
    "http://[fd00::1]/", // ULA(사설)
    "http://[fe80::1]/", // 링크로컬
    "http://[::ffff:127.0.0.1]/", // IPv4-매핑 루프백(파서가 [::ffff:7f00:1]로 정규화)
    "http://[::ffff:169.254.169.254]/", // IPv4-매핑 클라우드 메타데이터
    "http://[64:ff9b::7f00:1]/", // NAT64 → 127.0.0.1
  ];

  it.each(blockedUrls)("사설/예약 IPv6 리터럴은 차단: %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow(SsrfBlockedError);
  });

  const allowedUrls = [
    "http://[2606:4700:4700::1111]/", // 공인 IPv6
    "http://[::ffff:808:808]/", // IPv4-매핑이지만 내장 IPv4가 공인(8.8.8.8) — 과차단 방지
  ];

  it.each(allowedUrls)("공인 IPv6 리터럴은 통과(과차단 방지): %s", (url) => {
    expect(() => assertSafeUrl(url)).not.toThrow();
  });
});

describe("createSsrfSafeLookup — DNS 조회 시점 검증 (회귀 방지)", () => {
  it("기본 정책: 사설 IP로 해석되면 ESSRFBLOCKED로 거부하고 콜백은 정확히 1번만 불린다", async () => {
    resolvesTo({ address: "127.0.0.1", family: 4 });
    const result = await callLookup(createSsrfSafeLookup());
    expect(result.err?.code).toBe("ESSRFBLOCKED");
    expect(result.address).toBeUndefined();
    expect(result.calls).toBe(1);
  });

  it("기본 정책: 16진 표기 IPv4-매핑 루프백(::ffff:7f00:1)으로 해석돼도 거부한다", async () => {
    resolvesTo({ address: "::ffff:7f00:1", family: 6 });
    const result = await callLookup(createSsrfSafeLookup());
    expect(result.err?.code).toBe("ESSRFBLOCKED");
  });

  it("기본 정책: 공인 IP로 해석되면 그대로 통과시킨다(과차단 방지)", async () => {
    resolvesTo({ address: "93.184.216.34", family: 4 });
    const result = await callLookup(createSsrfSafeLookup());
    expect(result.err).toBeNull();
    expect(result.address).toBe("93.184.216.34");
  });

  it("판정 함수를 () => false로 주입하면 사설 IP도 통과한다(테스트 전용 재정의가 동작함)", async () => {
    resolvesTo({ address: "127.0.0.1", family: 4 });
    const result = await callLookup(createSsrfSafeLookup(() => false));
    expect(result.err).toBeNull();
    expect(result.address).toBe("127.0.0.1");
  });

  // fail-closed: 해석된 주소 중 하나라도 차단 대상이면 전체를 거부한다. 주소 순서와 무관해야 한다
  // (공인 주소가 앞에 있어도, 뒤에 있어도 사설 주소 하나가 섞이면 거부).
  const mixedOrders: Array<[string, Entry[]]> = [
    ["공인 → 사설", [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]],
    ["사설 → 공인", [{ address: "10.0.0.5", family: 4 }, { address: "93.184.216.34", family: 4 }]],
  ];

  it.each(mixedOrders)("주소 중 하나라도 사설이면 전체 거부(fail-closed): %s", async (_label, entries) => {
    resolvesTo(...entries);
    const result = await callLookup(createSsrfSafeLookup(), { all: true });
    expect(result.err?.code).toBe("ESSRFBLOCKED");
    expect(result.address).toBeUndefined();
    expect(result.calls).toBe(1);
  });

  it("DNS 자체 오류는 SSRF 차단으로 둔갑시키지 않고 원래 오류를 그대로 전달한다", async () => {
    lookupMock.mockImplementation((_host: string, _options: unknown, cb: (...args: unknown[]) => void) => {
      cb(Object.assign(new Error("not found"), { code: "ENOTFOUND" }), undefined, undefined);
    });
    const result = await callLookup(createSsrfSafeLookup());
    expect(result.err?.code).toBe("ENOTFOUND");
  });
});
