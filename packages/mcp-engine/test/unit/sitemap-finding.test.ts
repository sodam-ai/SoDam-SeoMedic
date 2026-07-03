import { describe, it, expect } from "vitest";
import { findMissingSitemapPaths } from "../../src/fixers/sitemap-finding.js";

describe("findMissingSitemapPaths", () => {
  it("로컬 브릿지 URL(127.0.0.1:포트)과 sitemap의 실제 배포 도메인을 경로 기준으로 비교한다", () => {
    const crawled = ["http://127.0.0.1:53214/", "http://127.0.0.1:53214/about", "http://127.0.0.1:53214/new-page"];
    const sitemap = ["https://example.com/", "https://example.com/about"];

    const result = findMissingSitemapPaths(crawled, sitemap);
    expect(result.missingUrls).toEqual(["https://example.com/new-page"]);
    expect(result.baseOriginInferred).toBe("https://example.com");
    expect(result.skippedPaths).toEqual([]);
  });

  it("트레일링 슬래시 차이는 같은 경로로 취급한다(오탐 방지)", () => {
    const crawled = ["http://127.0.0.1:53214/about/"];
    const sitemap = ["https://example.com/about"];

    const result = findMissingSitemapPaths(crawled, sitemap);
    expect(result.missingUrls).toEqual([]); // 트레일링 슬래시만 다를 뿐 같은 페이지 — 누락 아님
  });

  it("sitemap이 완전히 비어있으면 origin을 추측하지 않고 skippedPaths로만 보고한다(fail-closed)", () => {
    const crawled = ["http://127.0.0.1:53214/", "http://127.0.0.1:53214/about"];
    const sitemap: string[] = [];

    const result = findMissingSitemapPaths(crawled, sitemap);
    expect(result.missingUrls).toEqual([]);
    expect(result.baseOriginInferred).toBeNull();
    expect(result.skippedPaths.sort()).toEqual(["/", "/about"]);
  });

  it("crawl과 sitemap이 완전히 일치하면 누락 없음", () => {
    const crawled = ["http://127.0.0.1:53214/"];
    const sitemap = ["https://example.com/"];
    const result = findMissingSitemapPaths(crawled, sitemap);
    expect(result.missingUrls).toEqual([]);
    expect(result.skippedPaths).toEqual([]);
  });

  it("여러 개 누락 시 전부 잡는다", () => {
    const crawled = ["http://127.0.0.1:1/", "http://127.0.0.1:1/a", "http://127.0.0.1:1/b", "http://127.0.0.1:1/c"];
    const sitemap = ["https://x.com/"];
    const result = findMissingSitemapPaths(crawled, sitemap);
    expect(result.missingUrls.sort()).toEqual(["https://x.com/a", "https://x.com/b", "https://x.com/c"]);
  });
});
