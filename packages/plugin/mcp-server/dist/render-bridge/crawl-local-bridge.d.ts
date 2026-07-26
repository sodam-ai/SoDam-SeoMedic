import type { CrawlResult } from "../crawler/crawler.js";
export interface CrawlLocalBridgeOptions {
    maxPages?: number;
    maxDepth?: number;
}
/**
 * crawler/crawler.ts의 crawl()과 같은 BFS 링크추적 구조지만, safeFetch 대신
 * fetchLocalBridgeHtml(127.0.0.1 전용, SSRF 가드 미경유)을 쓴다 — crawl()은 safeFetch가
 * 사설 IP를 무조건 차단해 로컬 브릿지를 크롤할 수 없다(설계 검토에서 확인된 실제 제약).
 * robots.txt·rate-limit은 적용하지 않는다(자기 자신의 로컬 서버라 제3자 크롤 정책이 적용될 대상이 아님).
 */
export declare function crawlLocalBridge(expectedOrigin: string, options?: CrawlLocalBridgeOptions): Promise<CrawlResult>;
