import { launchGuardedBrowser } from "../render/browser-pool.js";
import { extractSignalsFromHtml } from "../render/dom-signals.js";
import { evaluateAllRules } from "../rules/registry.js";
import type { RuleContext, RuleViolation } from "../rules/types.js";
import { crawlLocalBridge } from "../render-bridge/crawl-local-bridge.js";
import { renderLocalBridgeAndExtractSignals } from "../render-bridge/render-local-bridge.js";
import { toLogicalPageUrl } from "../render-bridge/logical-url.js";
import { fetchLocalBridgeHtml } from "../render-bridge/local-fetch.js";
import { fetchSitemapUrls, type SitemapFetcher } from "../crawler/sitemap.js";
import { findMissingSitemapPaths, type MissingSitemapResult } from "../fixers/sitemap-finding.js";

export interface ScannedPage {
  logicalUrl: string;
  realUrl: string;
  statusCode: number;
  rawHtml: string;
  violations: RuleViolation[];
  /** 렌더링된 DOM의 canonical 값(R-CANONICAL-JS-ONLY fixer가 raw HTML로 이전할 때 그대로 보존해야
   * 하는 값 — 렌더 실패 시 rawSignals로 폴백되므로 그 경우 raw canonical과 동일해진다). */
  renderedCanonical: string | null;
  /** 렌더링된 DOM의 title 값(R-OG-BASIC-MISSING fixer가 openGraph.title로 복사할 소스 — 동일하게
   * 렌더 실패 시 rawSignals로 폴백된다). */
  renderedTitle: string | null;
}

export interface LocalFixScanResult {
  pages: ScannedPage[];
  allViolations: RuleViolation[];
  sitemap: MissingSitemapResult;
  truncated: boolean;
}

function localSitemapFetcher(expectedOrigin: string): SitemapFetcher {
  return async (url: string) => {
    const r = await fetchLocalBridgeHtml(url, expectedOrigin);
    return { status: r.status, bodyText: r.html };
  };
}

/**
 * 로컬 렌더 브릿지(origin)를 대상으로 크롤+렌더+규칙평가를 수행한다(Phase 1 audit-orchestrator.ts의
 * runAudit()과 같은 구조지만, safeFetch/assertSafeUrl 대신 로컬 브릿지 전용 경로를 쓴다 — 그 경로들이
 * 127.0.0.1을 SSRF로 차단해 그대로 재사용할 수 없음이 설계 검토에서 확인됨).
 *
 * CWV(Lighthouse)는 의도적으로 측정하지 않는다 — 지금 유일한 fixer(sitemap 누락 URL 추가)는 CWV와
 * 무관하고, RuleContext.cwv는 optional이라 없어도 cwv 규칙만 조용히 skip된다(Phase 1의 depth>0 페이지
 * 처리와 동일 원칙). CWV에 실제 영향을 주는 fixer가 생기면 그때 추가한다(과잉 구현 방지 결정).
 */
export async function scanLocalFix(
  origin: string,
  opts: { maxPages?: number; maxDepth?: number } = {},
): Promise<LocalFixScanResult> {
  const crawlResult = await crawlLocalBridge(origin, opts);

  const browser = await launchGuardedBrowser();
  const pages: ScannedPage[] = [];
  const allViolations: RuleViolation[] = [];

  try {
    for (const page of crawlResult.pages) {
      const rawSignals = extractSignalsFromHtml(page.html);

      let renderedSignals = rawSignals;
      try {
        const rendered = await renderLocalBridgeAndExtractSignals(browser, page.finalUrl, origin);
        renderedSignals = rendered.signals;
      } catch {
        // 렌더 실패는 이 페이지의 raw/rendered 비교만 건너뛴다(Phase 1 runAudit과 동일 원칙)
      }

      const logicalUrl = toLogicalPageUrl(page.url, origin);
      const ctx: RuleContext = {
        pageUrl: logicalUrl,
        statusCode: page.statusCode,
        finalUrl: logicalUrl,
        redirectChain: [],
        rawSignals,
        renderedSignals,
      };
      const violations = evaluateAllRules(ctx);
      allViolations.push(...violations);
      pages.push({
        logicalUrl,
        realUrl: page.url,
        statusCode: page.statusCode,
        rawHtml: page.html,
        violations,
        renderedCanonical: renderedSignals.canonical,
        renderedTitle: renderedSignals.title,
      });
    }
  } finally {
    await browser.close();
  }

  // sitemap 조회 실패(파싱 실패·sitemap-index가 다른 origin을 가리켜 assertLocalBridgeUrl이 거부하는 경우 등)는
  // 치명적이지 않다 — crawler/crawler.ts의 "sitemap 실패해도 링크탐색으로 폴백" 원칙과 동일하게 조용히 스킵한다.
  let sitemapUrls: string[] = [];
  try {
    const sitemapResult = await fetchSitemapUrls(`${origin}/sitemap.xml`, 2000, localSitemapFetcher(origin));
    sitemapUrls = sitemapResult.urls;
  } catch {
    // sitemap을 못 읽으면 "비교 대상 없음"으로 처리 — findMissingSitemapPaths가 빈 배열을 안전하게 처리한다
  }

  const crawledOkUrls = pages.filter((p) => p.statusCode === 200).map((p) => p.realUrl);
  const sitemap = findMissingSitemapPaths(crawledOkUrls, sitemapUrls);

  return { pages, allViolations, sitemap, truncated: crawlResult.truncated };
}
