import { normalizeUrl } from "../regression/finding-key.js";

/**
 * 초당 요청 수를 제한하는 간단한 토큰 버킷. rate-limit(req/s) 단위를 그대로 받아
 * "이전 통과 시각 + 1/rate초"가 지날 때까지 기다리는 방식(외부 의존성 불필요).
 */
export class RateLimiter {
  private nextAvailableAt = 0;
  private readonly intervalMs: number;

  constructor(requestsPerSecond: number) {
    if (requestsPerSecond <= 0) throw new Error("rate-limit은 0보다 커야 함");
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAvailableAt - now);
    this.nextAvailableAt = Math.max(now, this.nextAvailableAt) + this.intervalMs;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
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
export class CrawlFrontier {
  private readonly queue: FrontierEntry[] = [];
  private readonly seen = new Set<string>();
  private dequeuedCount = 0;

  constructor(
    startUrl: string,
    private readonly maxPages: number,
    private readonly maxDepth: number,
  ) {
    this.enqueue(startUrl, 0);
  }

  private normalize(url: string): string {
    try {
      return normalizeUrl(url);
    } catch {
      return url;
    }
  }

  enqueue(url: string, depth: number): void {
    if (depth > this.maxDepth) return;
    const normalized = this.normalize(url);
    if (this.seen.has(normalized)) return;
    if (this.seen.size >= this.maxPages) return; // 이미 상한만큼 예약됨
    this.seen.add(normalized);
    this.queue.push({ url: normalized, depth });
  }

  dequeue(): FrontierEntry | undefined {
    if (this.dequeuedCount >= this.maxPages) return undefined;
    const entry = this.queue.shift();
    if (entry) this.dequeuedCount++;
    return entry;
  }

  get hasNext(): boolean {
    return this.queue.length > 0 && this.dequeuedCount < this.maxPages;
  }

  get visitedCount(): number {
    return this.dequeuedCount;
  }
}
