import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchMock = vi.fn();
vi.mock("../../src/crawler/fetch-client.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

const { fetchSitemapUrls } = await import("../../src/crawler/sitemap.js");

beforeEach(() => {
  safeFetchMock.mockReset();
});

function urlsetXml(urls: string[]): string {
  const items = urls.map((u) => `<url><loc>${u}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

describe("fetchSitemapUrls — urlset 파싱", () => {
  it("urlset의 loc들을 그대로 추출", async () => {
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: urlsetXml(["https://example.com/a", "https://example.com/b"]) });
    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 200);
    expect(result.urls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(result.truncated).toBe(false);
  });

  it("단일 <url> 항목(배열 아님)도 정상 처리", async () => {
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: urlsetXml(["https://example.com/only"]) });
    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 200);
    expect(result.urls).toEqual(["https://example.com/only"]);
  });

  it("maxPages보다 많으면 잘라내고 truncated=true", async () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://example.com/p${i}`);
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: urlsetXml(many) });
    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 5);
    expect(result.urls).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it("200이 아니면 빈 목록", async () => {
    safeFetchMock.mockResolvedValue({ status: 404, bodyText: "" });
    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 200);
    expect(result.urls).toEqual([]);
  });

  it("깨진 XML은 예외 없이 빈 목록으로 폴백", async () => {
    safeFetchMock.mockResolvedValue({ status: 200, bodyText: "<urlset><url><loc>unterminated" });
    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 200);
    expect(result.urls).toEqual([]);
  });
});

describe("fetchSitemapUrls — sitemapindex 재귀", () => {
  it("sitemapindex가 가리키는 하위 sitemap들을 재귀적으로 합친다", async () => {
    const indexXml = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap>
    </sitemapindex>`;

    safeFetchMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/sitemap.xml") return { status: 200, bodyText: indexXml };
      if (url === "https://example.com/sitemap-a.xml") return { status: 200, bodyText: urlsetXml(["https://example.com/a1"]) };
      if (url === "https://example.com/sitemap-b.xml") return { status: 200, bodyText: urlsetXml(["https://example.com/b1"]) };
      throw new Error("unexpected url: " + url);
    });

    const result = await fetchSitemapUrls("https://example.com/sitemap.xml", 200);
    expect(result.urls.sort()).toEqual(["https://example.com/a1", "https://example.com/b1"]);
  });
});
