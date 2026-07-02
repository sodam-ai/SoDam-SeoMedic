import { describe, it, expect } from "vitest";
import { CrawlFrontier, RateLimiter } from "../../src/crawler/queue.js";

describe("CrawlFrontier", () => {
  it("시작 URL을 depth 0으로 큐에 넣는다", () => {
    const f = new CrawlFrontier("https://example.com/", 200, 3);
    expect(f.hasNext).toBe(true);
    const entry = f.dequeue();
    expect(entry).toEqual({ url: "https://example.com/", depth: 0 });
  });

  it("maxDepth를 초과하는 항목은 무시된다", () => {
    const f = new CrawlFrontier("https://example.com/", 200, 1);
    f.dequeue();
    f.enqueue("https://example.com/deep", 2); // maxDepth(1) 초과
    expect(f.hasNext).toBe(false);
  });

  it("중복 URL(fragment만 다른 경우 포함)은 한 번만 큐잉된다", () => {
    const f = new CrawlFrontier("https://example.com/", 200, 3);
    f.dequeue();
    f.enqueue("https://example.com/a", 1);
    f.enqueue("https://example.com/a#section", 1); // 정규화 후 동일
    f.enqueue("https://example.com/a", 1); // 완전 중복
    let count = 0;
    while (f.hasNext) {
      f.dequeue();
      count++;
    }
    expect(count).toBe(1);
  });

  it("maxPages를 초과해 dequeue하지 않는다", () => {
    const f = new CrawlFrontier("https://example.com/", 2, 3);
    f.dequeue(); // 1
    f.enqueue("https://example.com/a", 1);
    f.enqueue("https://example.com/b", 1);
    f.dequeue(); // 2 (a)
    expect(f.hasNext).toBe(false);
    expect(f.dequeue()).toBeUndefined();
    expect(f.visitedCount).toBe(2);
  });
});

describe("RateLimiter", () => {
  it("연속 wait() 호출 시 설정한 간격만큼 시간이 벌어진다", async () => {
    const limiter = new RateLimiter(10); // 100ms 간격
    const start = Date.now();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    const elapsed = Date.now() - start;
    // 3번째 wait까지 최소 2회 간격(약 200ms)은 지나야 함 — 타이밍 오차 감안해 넉넉히 검사
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it("rate<=0은 즉시 에러", () => {
    expect(() => new RateLimiter(0)).toThrow();
  });
});
