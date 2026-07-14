import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchMock = vi.fn();
vi.mock("../../src/crawler/fetch-client.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

// vi.mock은 호이스팅되므로, 모킹 이후에 실제 대상 모듈을 동적 import한다.
const { loadRobotsPolicy, loadAiCrawlerAccess } = await import("../../src/crawler/robots.js");

beforeEach(() => {
  safeFetchMock.mockReset();
});

describe("loadRobotsPolicy — 결정적 유닛(safeFetch 모킹)", () => {
  it("200 + Disallow 규칙이 있으면 해당 경로를 차단한다", async () => {
    safeFetchMock.mockResolvedValue({
      status: 200,
      bodyText: ["User-agent: *", "Disallow: /private/", "Crawl-delay: 2", "Sitemap: https://example.com/sitemap.xml"].join(
        "\n",
      ),
    });
    const policy = await loadRobotsPolicy("https://example.com");
    expect(policy.isAllowed("https://example.com/private/x")).toBe(false);
    expect(policy.isAllowed("https://example.com/public/x")).toBe(true);
    expect(policy.crawlDelaySeconds).toBe(2);
    expect(policy.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("404(robots.txt 없음)이면 전체 허용", async () => {
    safeFetchMock.mockResolvedValue({ status: 404, bodyText: "" });
    const policy = await loadRobotsPolicy("https://example.com");
    expect(policy.isAllowed("https://example.com/anything")).toBe(true);
  });

  it("5xx(서버 오류)이면 보수적으로 전체 거부", async () => {
    safeFetchMock.mockResolvedValue({ status: 503, bodyText: "" });
    const policy = await loadRobotsPolicy("https://example.com");
    expect(policy.isAllowed("https://example.com/anything")).toBe(false);
  });

  it("조회 자체가 예외로 실패(네트워크/SSRF 등)해도 보수적으로 전체 거부", async () => {
    safeFetchMock.mockRejectedValue(new Error("network down"));
    const policy = await loadRobotsPolicy("https://example.com");
    expect(policy.isAllowed("https://example.com/anything")).toBe(false);
  });
});

describe("loadAiCrawlerAccess — AI 크롤러 정책 리포트(결정적 유닛, safeFetch 모킹)", () => {
  it("특정 AI 봇만 Disallow하면 해당 봇만 차단으로 판정한다", async () => {
    safeFetchMock.mockResolvedValue({
      status: 200,
      bodyText: ["User-agent: GPTBot", "Disallow: /", "", "User-agent: *", "Allow: /"].join("\n"),
    });
    const report = await loadAiCrawlerAccess("https://example.com");
    expect(report).not.toBeNull();
    expect(report!.robotsTxtFound).toBe(true);
    const gptbot = report!.entries.find((e) => e.token === "GPTBot");
    const claudebot = report!.entries.find((e) => e.token === "ClaudeBot");
    expect(gptbot?.allowed).toBe(false);
    expect(claudebot?.allowed).toBe(true); // 명시 언급 없음 → * 규칙(Allow)으로 폴백
  });

  it("User-agent: * 로 전체 차단하면 목록의 모든 봇이 차단으로 판정된다", async () => {
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: ["User-agent: *", "Disallow: /"].join("\n") });
    const report = await loadAiCrawlerAccess("https://example.com");
    expect(report!.entries.every((e) => e.allowed === false)).toBe(true);
  });

  it("404(robots.txt 없음)이면 전체 허용 + robotsTxtFound=false로 정확히 표시", async () => {
    safeFetchMock.mockResolvedValue({ status: 404, bodyText: "" });
    const report = await loadAiCrawlerAccess("https://example.com");
    expect(report!.robotsTxtFound).toBe(false);
    expect(report!.entries.every((e) => e.allowed === true)).toBe(true);
  });

  it("5xx(조회 실패)면 정책을 알 수 없으므로 null을 반환한다(전체 차단으로 추측하지 않음)", async () => {
    safeFetchMock.mockResolvedValue({ status: 503, bodyText: "" });
    const report = await loadAiCrawlerAccess("https://example.com");
    expect(report).toBeNull();
  });

  it("네트워크 예외로 조회 자체가 실패해도 null을 반환한다", async () => {
    safeFetchMock.mockRejectedValue(new Error("network down"));
    const report = await loadAiCrawlerAccess("https://example.com");
    expect(report).toBeNull();
  });
});
