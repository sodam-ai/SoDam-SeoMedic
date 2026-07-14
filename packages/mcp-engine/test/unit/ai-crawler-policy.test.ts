import { describe, it, expect } from "vitest";
import { evaluateAiCrawlerAccess, AI_CRAWLER_CATALOG, type MinimalRobotsQuery } from "../../src/crawler/ai-crawler-policy.js";

function fakeRobot(disallowedTokens: string[]): MinimalRobotsQuery {
  return {
    isAllowed(_url: string, ua?: string): boolean | undefined {
      if (!ua) return true;
      return !disallowedTokens.includes(ua);
    },
  };
}

describe("evaluateAiCrawlerAccess — 순수 판정 로직", () => {
  it("robot이 null이면(robots.txt 없음) 카탈로그의 모든 봇을 허용으로 판정한다", () => {
    const report = evaluateAiCrawlerAccess(null, "absent", "https://example.com/");
    expect(report.robotsTxtFound).toBe(false);
    expect(report.entries).toHaveLength(AI_CRAWLER_CATALOG.length);
    expect(report.entries.every((e) => e.allowed)).toBe(true);
  });

  it("특정 토큰만 차단되면 해당 엔트리만 allowed=false로 판정한다", () => {
    const robot = fakeRobot(["GPTBot", "ClaudeBot"]);
    const report = evaluateAiCrawlerAccess(robot, "found", "https://example.com/");
    expect(report.robotsTxtFound).toBe(true);
    expect(report.entries.find((e) => e.token === "GPTBot")?.allowed).toBe(false);
    expect(report.entries.find((e) => e.token === "ClaudeBot")?.allowed).toBe(false);
    expect(report.entries.find((e) => e.token === "PerplexityBot")?.allowed).toBe(true);
  });

  it("isAllowed가 undefined(판단불가)를 반환해도 차단되지 않은 것으로 관대하게 처리한다", () => {
    const robot: MinimalRobotsQuery = { isAllowed: () => undefined };
    const report = evaluateAiCrawlerAccess(robot, "found", "https://example.com/");
    expect(report.entries.every((e) => e.allowed)).toBe(true);
  });

  it("카탈로그 각 엔트리는 purpose가 training/ai_search/user_fetch 중 하나이며 3개 카테고리가 모두 존재한다", () => {
    const purposes = new Set(AI_CRAWLER_CATALOG.map((e) => e.purpose));
    expect(purposes).toEqual(new Set(["training", "ai_search", "user_fetch"]));
  });

  it("카탈로그의 모든 token은 유일하다(중복 없음)", () => {
    const tokens = AI_CRAWLER_CATALOG.map((e) => e.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
