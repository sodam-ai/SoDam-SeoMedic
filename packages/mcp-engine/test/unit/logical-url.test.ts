import { describe, it, expect } from "vitest";
import { toLogicalPageUrl } from "../../src/render-bridge/logical-url.js";
import { computeFindingKey } from "../../src/regression/finding-key.js";
import { LocalBridgeError } from "../../src/render-bridge/local-loopback.js";

describe("toLogicalPageUrl — 렌더 브릿지 임시 포트 안정화", () => {
  it("경로를 보존하며 고정 placeholder 호스트로 치환한다", () => {
    const logical = toLogicalPageUrl("http://127.0.0.1:53214/about", "http://127.0.0.1:53214");
    expect(logical).toBe("http://local.seomedic.internal/about");
  });

  it("포트가 달라도(실행마다 랜덤) 같은 경로면 같은 논리 URL을 만든다", () => {
    const run1 = toLogicalPageUrl("http://127.0.0.1:53214/about", "http://127.0.0.1:53214");
    const run2 = toLogicalPageUrl("http://127.0.0.1:41000/about", "http://127.0.0.1:41000");
    expect(run1).toBe(run2);
  });

  it("이 안정성 덕분에 finding_key도 실행 간(포트 변화와 무관하게) 동일하다", () => {
    const logical1 = toLogicalPageUrl("http://127.0.0.1:53214/about", "http://127.0.0.1:53214");
    const logical2 = toLogicalPageUrl("http://127.0.0.1:41000/about", "http://127.0.0.1:41000");
    const key1 = computeFindingKey(logical1, "R-CANONICAL-MISSING", 1);
    const key2 = computeFindingKey(logical2, "R-CANONICAL-MISSING", 1);
    expect(key1).toBe(key2);
  });

  it("로컬 브릿지 URL이 아니면(검증 실패) 변환하지 않고 에러", () => {
    expect(() => toLogicalPageUrl("http://example.com/about", "http://127.0.0.1:53214")).toThrow(LocalBridgeError);
  });

  it("쿼리스트링은 유지한다(다른 쿼리=다른 논리 페이지)", () => {
    const logical = toLogicalPageUrl("http://127.0.0.1:3000/search?q=a", "http://127.0.0.1:3000");
    expect(logical).toBe("http://local.seomedic.internal/search?q=a");
  });
});
