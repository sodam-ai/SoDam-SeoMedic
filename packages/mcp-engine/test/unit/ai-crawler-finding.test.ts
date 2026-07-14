import { describe, it, expect } from "vitest";
import {
  buildAiCrawlerPolicyViolation,
  AI_CRAWLER_POLICY_RULE_ID,
  AI_CRAWLER_POLICY_RULE_VERSION,
} from "../../src/crawler/ai-crawler-finding.js";
import { evaluateAiCrawlerAccess, type MinimalRobotsQuery } from "../../src/crawler/ai-crawler-policy.js";

describe("buildAiCrawlerPolicyViolation — RuleViolation 빌더", () => {
  it("rule_id/category/severity/pageUrl을 정확히 채운다", () => {
    const report = evaluateAiCrawlerAccess(null, "absent", "https://example.com/");
    const violation = buildAiCrawlerPolicyViolation("https://example.com", report);
    expect(violation.ruleId).toBe(AI_CRAWLER_POLICY_RULE_ID);
    expect(violation.ruleVersion).toBe(AI_CRAWLER_POLICY_RULE_VERSION);
    expect(violation.category).toBe("geo");
    expect(violation.severity).toBe("low");
    expect(violation.pageUrl).toBe("https://example.com/robots.txt");
  });

  it("robots.txt가 없으면(absent) currentValue에 '없음' 사실을 명시한다", () => {
    const report = evaluateAiCrawlerAccess(null, "absent", "https://example.com/");
    const violation = buildAiCrawlerPolicyViolation("https://example.com", report);
    expect(violation.currentValue).toContain("robots.txt 없음");
  });

  it("특정 봇이 차단되면 currentValue에 해당 토큰 이름이 나타난다", () => {
    const robot: MinimalRobotsQuery = { isAllowed: (_url, ua) => ua !== "GPTBot" };
    const report = evaluateAiCrawlerAccess(robot, "found", "https://example.com/");
    const violation = buildAiCrawlerPolicyViolation("https://example.com", report);
    expect(violation.currentValue).toContain("GPTBot");
    expect(violation.currentValue).not.toContain("robots.txt 없음"); // found일 땐 이 문구가 없어야 함
  });

  it("recommendedValue는 특정 정책을 권고하지 않는 중립 문구여야 한다", () => {
    const report = evaluateAiCrawlerAccess(null, "absent", "https://example.com/");
    const violation = buildAiCrawlerPolicyViolation("https://example.com", report);
    expect(violation.recommendedValue).toContain("권장하지 않");
    expect(violation.recommendedValue).not.toMatch(/차단하세요|허용하세요|반드시.*(차단|허용)/); // 지시형 표현 없어야 함
  });
});
