import { parseHTML } from "linkedom";
import { getAttrCI } from "../render/dom-signals.js";
import { safeFetch } from "./fetch-client.js";
import { loadRobotsPolicy } from "./robots.js";
import { fetchSitemapUrls } from "./sitemap.js";
import { CrawlFrontier, RateLimiter } from "./queue.js";
import { assertSafeUrl } from "./ssrf-guard.js";

export interface CrawlOptions {
  siteMode: boolean;
  maxPages: number; // 기본 200(사이트모드)
  maxDepth: number; // 기본 3(사이트모드)
  requestsPerSecond: number; // 기본 1
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  siteMode: false,
  maxPages: 200,
  maxDepth: 3,
  requestsPerSecond: 1,
};

export interface CrawledPage {
  url: string;
  depth: number;
  statusCode: number;
  html: string;
  finalUrl: string;
  redirectChain: string[];
}

export interface CrawlResult {
  pages: CrawledPage[];
  skippedByRobots: string[];
  truncated: boolean;
}

/** render-bridge/crawl-local-bridge.ts가 로컬 브릿지 크롤에도 재사용한다(중복 구현 방지). */
export function extractSameOriginLinks(html: string, pageUrl: string): string[] {
  let document: Document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return []; // 깨진 HTML은 링크 발견 없이 조용히 스킵(크롤 자체를 막지 않음)
  }

  const origin = new URL(pageUrl).origin;
  const links = new Set<string>();
  // linkedom은 속성명 대소문자를 정규화하지 않아 "a[href]" 셀렉터가 <A HREF=...>(대문자)에서
  // 조용히 0건 매칭될 수 있다(실측 확인됨) — 태그명으로만 찾고 속성은 대소문자 무관 헬퍼로 읽는다.
  for (const a of Array.from(document.querySelectorAll("a"))) {
    const href = getAttrCI(a, "href");
    if (!href) continue;
    try {
      const resolved = new URL(href, pageUrl);
      resolved.hash = "";
      if (resolved.origin === origin && (resolved.protocol === "http:" || resolved.protocol === "https:")) {
        links.add(resolved.toString());
      }
    } catch {
      // 유효하지 않은 href(예: javascript:, mailto:)는 무시
    }
  }
  return Array.from(links);
}

/**
 * 단일 URL 또는(사이트모드일 때) BFS 크롤을 수행한다.
 * robots.txt는 항상 확인한다 — 단일 URL 모드에서도 대상이 명시적으로 차단한 경로는 가져오지 않는다.
 */
export async function crawl(startUrl: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
  const opts: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...options };
  // 스킴·사설IP 검증을 크롤 진입점에서 가장 먼저 수행한다(2026-08-09 발견·수정).
  // 이전에는 이 검증 없이 곧장 loadRobotsPolicy(origin)를 호출했는데, file:// 같은 스킴은
  // opaque origin이 되어(new URL("file:///x").origin === "null") robots.ts 내부의
  // new URL("/robots.txt", origin)이 "TypeError: Invalid URL"로 우연히 죽는 방식으로만
  // 막혔다 — 의도된 SsrfBlockedError(명확한 사유)가 아니라 우연한 예외였다(실제 MCP 서버
  // 호출로 재현·확인). assertSafeUrl은 이미 27개 단위테스트로 검증된 함수를 그대로 재사용한다.
  assertSafeUrl(startUrl);
  const origin = new URL(startUrl).origin;
  const robots = await loadRobotsPolicy(origin);
  const rateLimiter = new RateLimiter(opts.requestsPerSecond);

  const pages: CrawledPage[] = [];
  const skippedByRobots: string[] = [];

  if (!opts.siteMode) {
    if (!robots.isAllowed(startUrl)) {
      skippedByRobots.push(startUrl);
      return { pages, skippedByRobots, truncated: false };
    }
    await rateLimiter.wait();
    const res = await safeFetch(startUrl);
    pages.push({
      url: startUrl,
      depth: 0,
      statusCode: res.status,
      html: res.bodyText,
      finalUrl: res.finalUrl,
      redirectChain: res.redirectChain,
    });
    return { pages, skippedByRobots, truncated: false };
  }

  const frontier = new CrawlFrontier(startUrl, opts.maxPages, opts.maxDepth);
  let truncated = false;

  // sitemap이 있으면 우선 시드로 사용(발견 누락 방지) — robots가 알려준 sitemap 없으면 관례적 기본 경로도 시도
  const sitemapCandidates = robots.sitemaps.length > 0 ? robots.sitemaps : [new URL("/sitemap.xml", origin).toString()];
  for (const sitemapUrl of sitemapCandidates) {
    try {
      const { urls, truncated: t } = await fetchSitemapUrls(sitemapUrl, opts.maxPages);
      if (t) truncated = true;
      for (const u of urls) {
        if (new URL(u).origin === origin) frontier.enqueue(u, 1);
      }
    } catch {
      // sitemap 조회 실패는 치명적이지 않음 — 링크 탐색으로 폴백
    }
  }

  while (frontier.hasNext) {
    const entry = frontier.dequeue();
    if (!entry) break;

    if (!robots.isAllowed(entry.url)) {
      skippedByRobots.push(entry.url);
      continue;
    }

    await rateLimiter.wait();
    let res;
    try {
      res = await safeFetch(entry.url);
    } catch {
      continue; // 개별 페이지 실패는 전체 크롤을 막지 않음
    }

    pages.push({
      url: entry.url,
      depth: entry.depth,
      statusCode: res.status,
      html: res.bodyText,
      finalUrl: res.finalUrl,
      redirectChain: res.redirectChain,
    });

    if (res.status === 200 && entry.depth < opts.maxDepth) {
      for (const link of extractSameOriginLinks(res.bodyText, entry.url)) {
        frontier.enqueue(link, entry.depth + 1);
      }
    }
  }

  if (frontier.visitedCount >= opts.maxPages) truncated = true;

  return { pages, skippedByRobots, truncated };
}
