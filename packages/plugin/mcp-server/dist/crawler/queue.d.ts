/**
 * 초당 요청 수를 제한하는 간단한 토큰 버킷. rate-limit(req/s) 단위를 그대로 받아
 * "이전 통과 시각 + 1/rate초"가 지날 때까지 기다리는 방식(외부 의존성 불필요).
 */
export declare class RateLimiter {
    private nextAvailableAt;
    private readonly intervalMs;
    constructor(requestsPerSecond: number);
    wait(): Promise<void>;
}
export interface FrontierEntry {
    url: string;
    depth: number;
}
/**
 * BFS 프런티어. max-pages(총 방문 상한)·depth(최대 깊이)·중복 방문 방지를 담당.
 * URL 정규화는 회귀감지(finding-key.ts)와 **동일한 함수**를 재사용한다 — 크롤 중복방지와
 * finding_key 계산이 서로 다른 규칙을 쓰면 "같은 페이지가 다른 키로 잡히는" 불일치가 생기기 때문
 * (M0~M4 설계 검토에서 지적된 위험, M5에서 통일).
 */
export declare class CrawlFrontier {
    private readonly maxPages;
    private readonly maxDepth;
    private readonly queue;
    private readonly seen;
    private dequeuedCount;
    constructor(startUrl: string, maxPages: number, maxDepth: number);
    private normalize;
    enqueue(url: string, depth: number): void;
    dequeue(): FrontierEntry | undefined;
    get hasNext(): boolean;
    get visitedCount(): number;
}
