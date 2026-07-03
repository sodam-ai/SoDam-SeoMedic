import { extractSameOriginLinks } from "../crawler/crawler.js";
import { CrawlFrontier } from "../crawler/queue.js";
import { fetchLocalBridgeHtml } from "./local-fetch.js";
import type { CrawledPage, CrawlResult } from "../crawler/crawler.js";

export interface CrawlLocalBridgeOptions {
  maxPages?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_PAGES = 200; // Phase 1 사이트모드 기본값과 동일(일관성)
const DEFAULT_MAX_DEPTH = 3;

/**
 * crawler/crawler.ts의 crawl()과 같은 BFS 링크추적 구조지만, safeFetch 대신
 * fetchLocalBridgeHtml(127.0.0.1 전용, SSRF 가드 미경유)을 쓴다 — crawl()은 safeFetch가
 * 사설 IP를 무조건 차단해 로컬 브릿지를 크롤할 수 없다(설계 검토에서 확인된 실제 제약).
 * robots.txt·rate-limit은 적용하지 않는다(자기 자신의 로컬 서버라 제3자 크롤 정책이 적용될 대상이 아님).
 */
export async function crawlLocalBridge(expectedOrigin: string, options: CrawlLocalBridgeOptions = {}): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const frontier = new CrawlFrontier(expectedOrigin + "/", maxPages, maxDepth);
  const pages: CrawledPage[] = [];

  while (frontier.hasNext) {
    const entry = frontier.dequeue();
    if (!entry) break;

    let result;
    try {
      result = await fetchLocalBridgeHtml(entry.url, expectedOrigin);
    } catch {
      continue; // 개별 페이지 실패는 전체 크롤을 막지 않음(crawl()과 동일 원칙)
    }

    pages.push({
      url: entry.url,
      depth: entry.depth,
      statusCode: result.status,
      html: result.html,
      finalUrl: entry.url, // fetchLocalBridgeHtml은 리다이렉트를 별도 체인으로 노출하지 않음(로컬 신뢰 경계라 불필요)
      redirectChain: [],
    });

    if (result.status === 200 && entry.depth < maxDepth) {
      for (const link of extractSameOriginLinks(result.html, entry.url)) {
        frontier.enqueue(link, entry.depth + 1);
      }
    }
  }

  return {
    pages,
    skippedByRobots: [],
    truncated: frontier.visitedCount >= maxPages,
  };
}
