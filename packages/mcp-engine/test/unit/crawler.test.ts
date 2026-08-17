import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchMock = vi.fn();
const loadRobotsPolicyMock = vi.fn();
const fetchSitemapUrlsMock = vi.fn();

vi.mock("../../src/crawler/fetch-client.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));
vi.mock("../../src/crawler/robots.js", () => ({
  loadRobotsPolicy: (...args: unknown[]) => loadRobotsPolicyMock(...args),
}));
vi.mock("../../src/crawler/sitemap.js", () => ({
  fetchSitemapUrls: (...args: unknown[]) => fetchSitemapUrlsMock(...args),
}));

const { crawl } = await import("../../src/crawler/crawler.js");
const { SsrfBlockedError } = await import("../../src/crawler/ssrf-guard.js");

function allowAll() {
  return { isAllowed: () => true, crawlDelaySeconds: undefined, sitemaps: [] as string[] };
}

beforeEach(() => {
  safeFetchMock.mockReset();
  loadRobotsPolicyMock.mockReset();
  fetchSitemapUrlsMock.mockReset();
  fetchSitemapUrlsMock.mockResolvedValue({ urls: [], truncated: false });
  loadRobotsPolicyMock.mockResolvedValue(allowAll());
});

describe("crawl — 단일 URL 모드", () => {
  it("링크를 따라가지 않고 시작 URL 1개만 가져온다", async () => {
    safeFetchMock.mockResolvedValue({
      status: 200,
      bodyText: `<html><body><a href="/other">link</a></body></html>`,
    });
    const result = await crawl("https://example.com/start", { siteMode: false });
    expect(result.pages).toHaveLength(1);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("robots가 차단하면 아예 가져오지 않는다", async () => {
    loadRobotsPolicyMock.mockResolvedValue({ isAllowed: () => false, crawlDelaySeconds: undefined, sitemaps: [] });
    const result = await crawl("https://example.com/blocked", { siteMode: false });
    expect(result.pages).toHaveLength(0);
    expect(result.skippedByRobots).toEqual(["https://example.com/blocked"]);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("file:// 등 허용 안 된 스킴은 SsrfBlockedError로 즉시 거부한다(회귀 방지 — 2026-08-09 발견)", async () => {
    // 실제 라이브 검증에서 이 케이스가 의도된 SsrfBlockedError가 아니라 robots.ts 내부의
    // 우연한 "TypeError: Invalid URL"로만 막히고 있었음이 드러났다. 이 테스트는 (1) 명시적으로
    // SsrfBlockedError가 던져지는지, (2) robots.txt 조회·fetch 등 이후 단계가 아예 호출되지
    // 않는지(진입점에서 가장 먼저 걸러지는지) 둘 다 검증한다.
    await expect(crawl("file:///etc/passwd", { siteMode: false })).rejects.toThrow(SsrfBlockedError);
    expect(loadRobotsPolicyMock).not.toHaveBeenCalled();
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("사설/예약 IP 리터럴(루프백)도 크롤 진입점에서 즉시 거부한다", async () => {
    await expect(crawl("http://127.0.0.1/", { siteMode: false })).rejects.toThrow(SsrfBlockedError);
    expect(loadRobotsPolicyMock).not.toHaveBeenCalled();
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});

describe("crawl — 사이트 모드(BFS)", () => {
  it("대문자 속성(<A HREF=...>)도 링크로 인식한다 (linkedom 속성 대소문자 버그 회귀 방지)", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/upper") return { status: 200, bodyText: `<HTML><BODY><A HREF="/next">L</A></BODY></HTML>` };
      if (url === "https://example.com/next") return { status: 200, bodyText: "끝" };
      throw new Error("unexpected: " + url);
    });
    const result = await crawl("https://example.com/upper", { siteMode: true, maxPages: 10, maxDepth: 2, requestsPerSecond: 1000 });
    expect(result.pages.map((p) => p.url).sort()).toEqual(["https://example.com/next", "https://example.com/upper"]);
  });

  it("같은 origin 링크를 depth 제한 안에서 따라간다", async () => {
    const pageA = `<html><body><a href="/b">to b</a><a href="https://other.com/x">외부</a></body></html>`;
    const pageB = `<html><body><a href="/c">to c</a></body></html>`;
    const pageC = `<html><body>끝</body></html>`;

    safeFetchMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/a") return { status: 200, bodyText: pageA };
      if (url === "https://example.com/b") return { status: 200, bodyText: pageB };
      if (url === "https://example.com/c") return { status: 200, bodyText: pageC };
      throw new Error("unexpected fetch: " + url);
    });

    const result = await crawl("https://example.com/a", {
      siteMode: true,
      maxPages: 10,
      maxDepth: 3,
      requestsPerSecond: 1000, // 테스트 속도를 위해 사실상 제한 없음
    });

    const urls = result.pages.map((p) => p.url).sort();
    expect(urls).toEqual(["https://example.com/a", "https://example.com/b", "https://example.com/c"]);
    // 외부 origin(other.com)은 절대 fetch되지 않아야 함
    expect(safeFetchMock).not.toHaveBeenCalledWith("https://other.com/x", expect.anything());
  });

  it("maxPages에 도달하면 그 이상 방문하지 않는다", async () => {
    const manyLinksPage = `<html><body>${Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("")}</body></html>`;
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: manyLinksPage });

    const result = await crawl("https://example.com/start", {
      siteMode: true,
      maxPages: 5,
      maxDepth: 3,
      requestsPerSecond: 1000,
    });

    expect(result.pages.length).toBeLessThanOrEqual(5);
    expect(result.truncated).toBe(true);
  });

  it("maxDepth를 넘는 링크는 방문하지 않는다", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      const depthMatch = url.match(/\/d(\d)/);
      const currentDepth = depthMatch ? Number(depthMatch[1]) : 0;
      return {
        status: 200,
        bodyText: `<html><body><a href="/d${currentDepth + 1}">next</a></body></html>`,
      };
    });

    const result = await crawl("https://example.com/d0", {
      siteMode: true,
      maxPages: 100,
      maxDepth: 1,
      requestsPerSecond: 1000,
    });

    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://example.com/d0");
    expect(urls).toContain("https://example.com/d1");
    expect(urls).not.toContain("https://example.com/d2");
  });

  it("robots가 차단한 페이지는 건너뛰고 나머지는 계속 진행한다", async () => {
    loadRobotsPolicyMock.mockResolvedValue({
      isAllowed: (url: string) => !url.includes("/private"),
      crawlDelaySeconds: undefined,
      sitemaps: [],
    });
    safeFetchMock.mockImplementation(async (url: string) => ({
      status: 200,
      bodyText: url === "https://example.com/start" ? `<a href="/private">x</a><a href="/public">y</a>` : "끝",
    }));

    const result = await crawl("https://example.com/start", { siteMode: true, maxPages: 10, maxDepth: 2, requestsPerSecond: 1000 });

    expect(result.skippedByRobots).toContain("https://example.com/private");
    expect(result.pages.map((p) => p.url)).toContain("https://example.com/public");
  });
});

describe("crawl — 실제 네트워크 스모크(단일 URL 모드)", () => {
  it("mock 해제 후 example.com을 실제로 가져온다", async () => {
    vi.doUnmock("../../src/crawler/fetch-client.js");
    vi.doUnmock("../../src/crawler/robots.js");
    vi.doUnmock("../../src/crawler/sitemap.js");
    vi.resetModules();
    const { crawl: realCrawl } = await import("../../src/crawler/crawler.js");
    const result = await realCrawl("https://example.com/", { siteMode: false });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].statusCode).toBe(200);
    expect(result.pages[0].html).toContain("Example Domain");
  });
});
