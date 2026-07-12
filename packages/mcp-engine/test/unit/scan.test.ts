import { describe, it, expect, vi, beforeEach } from "vitest";

// scan.ts의 의존 모듈을 전부 목업해 실제 브라우저·Next 서버 없이 순수 배선 로직만 검증한다
// (sitemap.test.ts의 safeFetch 목업 패턴과 동일 스타일 — 이 코드베이스에서 이미 검증된 접근).
const crawlLocalBridgeMock = vi.fn();
vi.mock("../../src/render-bridge/crawl-local-bridge.js", () => ({
  crawlLocalBridge: (...args: unknown[]) => crawlLocalBridgeMock(...args),
}));

const launchGuardedBrowserMock = vi.fn();
vi.mock("../../src/render/browser-pool.js", () => ({
  launchGuardedBrowser: (...args: unknown[]) => launchGuardedBrowserMock(...args),
}));

const renderLocalBridgeAndExtractSignalsMock = vi.fn();
vi.mock("../../src/render-bridge/render-local-bridge.js", () => ({
  renderLocalBridgeAndExtractSignals: (...args: unknown[]) => renderLocalBridgeAndExtractSignalsMock(...args),
}));

const toLogicalPageUrlMock = vi.fn();
vi.mock("../../src/render-bridge/logical-url.js", () => ({
  toLogicalPageUrl: (...args: unknown[]) => toLogicalPageUrlMock(...args),
}));

const fetchSitemapUrlsMock = vi.fn();
vi.mock("../../src/crawler/sitemap.js", () => ({
  fetchSitemapUrls: (...args: unknown[]) => fetchSitemapUrlsMock(...args),
}));

const { scanLocalFix } = await import("../../src/fix-orchestrator/scan.js");

const ORIGIN = "http://127.0.0.1:54321";
const RAW_HTML_NO_CANONICAL = "<html><head><title>t</title></head><body><h1>hi</h1></body></html>";

beforeEach(() => {
  crawlLocalBridgeMock.mockReset();
  launchGuardedBrowserMock.mockReset();
  renderLocalBridgeAndExtractSignalsMock.mockReset();
  toLogicalPageUrlMock.mockReset();
  fetchSitemapUrlsMock.mockReset();

  launchGuardedBrowserMock.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) });
  toLogicalPageUrlMock.mockImplementation((localUrl: string) => localUrl.replace(ORIGIN, "http://local.seomedic.internal"));
  fetchSitemapUrlsMock.mockResolvedValue({ urls: [], truncated: false });
});

describe("scanLocalFix — ScannedPage.renderedCanonical 배선(R-CANONICAL-JS-ONLY 선행조건)", () => {
  it("렌더 성공 시 rendered DOM의 canonical 값을 ScannedPage.renderedCanonical에 채운다(raw와 다른 값도 그대로)", async () => {
    crawlLocalBridgeMock.mockResolvedValue({
      pages: [
        { url: `${ORIGIN}/`, depth: 0, statusCode: 200, html: RAW_HTML_NO_CANONICAL, finalUrl: `${ORIGIN}/`, redirectChain: [] },
      ],
      skippedByRobots: [],
      truncated: false,
    });
    renderLocalBridgeAndExtractSignalsMock.mockResolvedValue({
      finalUrl: `${ORIGIN}/`,
      statusCode: 200,
      signals: {
        title: "t",
        canonical: "https://example.com/other-page", // raw엔 없고 JS 렌더에만 존재 + 자기 경로("/")와 다름
        h1Count: 1,
        h1Text: "hi",
        metaRobots: null,
        jsonLdBlocks: [],
        ogTitle: null,
        ogUrl: null,
        ogDescription: null,
        metaDescription: null,
      },
    });

    const result = await scanLocalFix(ORIGIN);

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].renderedCanonical).toBe("https://example.com/other-page");
  });

  it("렌더가 실패하면 raw 신호로 폴백하므로 renderedCanonical도 raw canonical과 동일하다(raw에 없으면 null)", async () => {
    crawlLocalBridgeMock.mockResolvedValue({
      pages: [
        { url: `${ORIGIN}/`, depth: 0, statusCode: 200, html: RAW_HTML_NO_CANONICAL, finalUrl: `${ORIGIN}/`, redirectChain: [] },
      ],
      skippedByRobots: [],
      truncated: false,
    });
    renderLocalBridgeAndExtractSignalsMock.mockRejectedValue(new Error("render timeout"));

    const result = await scanLocalFix(ORIGIN);

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].renderedCanonical).toBeNull();
  });

  it("raw HTML에 이미 canonical이 있으면(정상 케이스) renderedCanonical도 같은 값을 반영한다", async () => {
    const rawHtmlWithCanonical =
      '<html><head><title>t</title><link rel="canonical" href="/about"></head><body><h1>hi</h1></body></html>';
    crawlLocalBridgeMock.mockResolvedValue({
      pages: [
        { url: `${ORIGIN}/about`, depth: 0, statusCode: 200, html: rawHtmlWithCanonical, finalUrl: `${ORIGIN}/about`, redirectChain: [] },
      ],
      skippedByRobots: [],
      truncated: false,
    });
    renderLocalBridgeAndExtractSignalsMock.mockResolvedValue({
      finalUrl: `${ORIGIN}/about`,
      statusCode: 200,
      signals: {
        title: "t",
        canonical: "/about",
        h1Count: 1,
        h1Text: "hi",
        metaRobots: null,
        jsonLdBlocks: [],
        ogTitle: null,
        ogUrl: null,
        ogDescription: null,
        metaDescription: null,
      },
    });

    const result = await scanLocalFix(ORIGIN);

    expect(result.pages[0].renderedCanonical).toBe("/about");
  });
});
