import { describe, it, expect } from "vitest";
import { Response } from "undici";
import { safeFetch, resolveRedirectTarget, readBodyWithLimit } from "../../src/crawler/fetch-client.js";
import { SsrfBlockedError } from "../../src/crawler/ssrf-guard.js";

describe("safeFetch — 실제 네트워크(공인 사이트)", () => {
  it("example.com은 정상 응답", async () => {
    const result = await safeFetch("https://example.com/");
    expect(result.status).toBe(200);
    expect(result.bodyText).toContain("Example Domain");
  });

  it("사설 IP 리터럴 URL은 네트워크 시도 전에 즉시 차단", async () => {
    await expect(safeFetch("http://127.0.0.1:9/x")).rejects.toThrow(SsrfBlockedError);
  });
});

describe("resolveRedirectTarget — 리다이렉트 재검증 게이트(네트워크 불필요, 결정적)", () => {
  it("절대 URL로 사설 IP를 가리키면 차단", () => {
    expect(() => resolveRedirectTarget("https://example.com/start", "http://169.254.169.254/latest/meta-data/")).toThrow(
      SsrfBlockedError,
    );
  });

  it("프로토콜 상대 경로(//host)로 사설 IP를 가리켜도 차단", () => {
    expect(() => resolveRedirectTarget("https://example.com/start", "//127.0.0.1/secret")).toThrow(SsrfBlockedError);
  });

  it("상대 경로 리다이렉트는 origin이 공인이면 통과(원래 호스트 유지)", () => {
    const result = resolveRedirectTarget("https://example.com/start", "/next-page");
    expect(result).toBe("https://example.com/next-page");
  });

  it("공인 호스트 간 off-host 리다이렉트는 통과", () => {
    const result = resolveRedirectTarget("https://example.com/start", "https://www.iana.org/domains/example");
    expect(result).toBe("https://www.iana.org/domains/example");
  });

  it("file:// 스킴으로의 리다이렉트는 차단", () => {
    expect(() => resolveRedirectTarget("https://example.com/start", "file:///etc/passwd")).toThrow(SsrfBlockedError);
  });
});

describe("readBodyWithLimit — 응답 크기 상한(네트워크 불필요)", () => {
  it("상한 이하 응답은 정상 반환", async () => {
    const res = new Response("hello world");
    const text = await readBodyWithLimit(res as any, 1024);
    expect(text).toBe("hello world");
  });

  it("상한을 초과하는 응답은 거부된다", async () => {
    const bigBody = "x".repeat(2000);
    const res = new Response(bigBody);
    await expect(readBodyWithLimit(res as any, 1000)).rejects.toThrow(SsrfBlockedError);
  });

  it("body가 없는 응답(204 등)은 빈 문자열 반환", async () => {
    const res = new Response(null, { status: 204 });
    const text = await readBodyWithLimit(res as any, 1000);
    expect(text).toBe("");
  });
});
