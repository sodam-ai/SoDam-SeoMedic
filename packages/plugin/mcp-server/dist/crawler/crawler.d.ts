export interface CrawlOptions {
    siteMode: boolean;
    maxPages: number;
    maxDepth: number;
    requestsPerSecond: number;
}
export declare const DEFAULT_CRAWL_OPTIONS: CrawlOptions;
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
export declare function extractSameOriginLinks(html: string, pageUrl: string): string[];
/**
 * 단일 URL 또는(사이트모드일 때) BFS 크롤을 수행한다.
 * robots.txt는 항상 확인한다 — 단일 URL 모드에서도 대상이 명시적으로 차단한 경로는 가져오지 않는다.
 */
export declare function crawl(startUrl: string, options?: Partial<CrawlOptions>): Promise<CrawlResult>;
