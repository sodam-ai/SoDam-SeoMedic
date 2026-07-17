export interface SitemapResult {
    urls: string[];
    truncated: boolean;
}
export interface SitemapFetcherResult {
    status: number;
    bodyText: string;
}
export type SitemapFetcher = (url: string) => Promise<SitemapFetcherResult>;
/**
 * sitemap.xml(또는 sitemap-index.xml)을 가져와 최종 URL 목록으로 평탄화한다.
 * sitemap-index는 최대 MAX_SITEMAP_INDEX_ENTRIES개까지만 하위 sitemap을 따라가고,
 * 그 이상은 truncated=true로 표시해 상위(큐)가 알 수 있게 한다.
 *
 * fetcher는 기본값(safeFetch 기반)이 기존 동작을 그대로 보존한다 — 로컬 렌더 브릿지(127.0.0.1)는
 * safeFetch가 SSRF 가드로 차단하므로, fix 오케스트레이터만 fetchLocalBridgeHtml 기반 fetcher를 넘긴다.
 */
export declare function fetchSitemapUrls(sitemapUrl: string, maxPages: number, fetcher?: SitemapFetcher): Promise<SitemapResult>;
