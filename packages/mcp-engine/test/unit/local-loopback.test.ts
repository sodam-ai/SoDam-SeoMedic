import { describe, it, expect } from "vitest";
import { assertLocalBridgeUrl, LocalBridgeError } from "../../src/render-bridge/local-loopback.js";

describe("assertLocalBridgeUrl", () => {
  it("127.0.0.1 + origin 일치 시 통과", () => {
    expect(() => assertLocalBridgeUrl("http://127.0.0.1:3000/about", "http://127.0.0.1:3000")).not.toThrow();
  });

  it("localhost 문자열은 명시적으로 거부(hosts 파일 우회 대응)", () => {
    expect(() => assertLocalBridgeUrl("http://localhost:3000/", "http://localhost:3000")).toThrow(LocalBridgeError);
  });

  it("다른 사설 IP(예: 192.168.x.x)도 거부 — 127.0.0.1 리터럴만 허용", () => {
    expect(() => assertLocalBridgeUrl("http://192.168.1.1:3000/", "http://192.168.1.1:3000")).toThrow(LocalBridgeError);
  });

  it("포트가 다르면(expectedOrigin과 불일치) 거부", () => {
    expect(() => assertLocalBridgeUrl("http://127.0.0.1:9999/", "http://127.0.0.1:3000")).toThrow(LocalBridgeError);
  });

  it("https 스킴은 거부(로컬 브릿지는 http만)", () => {
    expect(() => assertLocalBridgeUrl("https://127.0.0.1:3000/", "https://127.0.0.1:3000")).toThrow(LocalBridgeError);
  });

  it("공인 사이트 URL은 당연히 거부", () => {
    expect(() => assertLocalBridgeUrl("http://example.com/", "http://127.0.0.1:3000")).toThrow(LocalBridgeError);
  });

  it("유효하지 않은 URL 문자열은 거부", () => {
    expect(() => assertLocalBridgeUrl("not a url", "http://127.0.0.1:3000")).toThrow(LocalBridgeError);
  });
});
