import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchMock = vi.fn();
vi.mock("../../src/crawler/fetch-client.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

// vi.mock은 호이스팅되므로, 모킹 이후에 실제 대상 모듈을 동적 import한다.
const { loadRobotsPolicy } = await import("../../src/crawler/robots.js");

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
