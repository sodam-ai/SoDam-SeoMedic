import type { Rule, RuleViolation } from "../types.js";

const VERSION = 1;

export const statusClientErrorRule: Rule = {
  id: "R-STATUS-4XX",
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode < 400 || ctx.statusCode >= 500) return null;
    return {
      ruleId: "R-STATUS-4XX",
      ruleVersion: VERSION,
      category: "indexing",
      severity: "critical",
      pageUrl: ctx.pageUrl,
      currentValue: String(ctx.statusCode),
      recommendedValue: "200 또는 의도된 301로 정정",
    };
  },
};

export const statusServerErrorRule: Rule = {
  id: "R-STATUS-5XX",
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode < 500) return null;
    return {
      ruleId: "R-STATUS-5XX",
      ruleVersion: VERSION,
      category: "indexing",
      severity: "critical",
      pageUrl: ctx.pageUrl,
      currentValue: String(ctx.statusCode),
      recommendedValue: "서버 오류 원인 조사 필요",
    };
  },
};

/** 리다이렉트 홉이 2회 이상이면 크롤 예산 낭비 + 링크주스 손실 위험 */
export const redirectChainLongRule: Rule = {
  id: "R-REDIRECT-CHAIN-LONG",
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation | null {
    if (ctx.redirectChain.length < 2) return null;
    return {
      ruleId: "R-REDIRECT-CHAIN-LONG",
      ruleVersion: VERSION,
      category: "indexing",
      severity: "medium",
      pageUrl: ctx.pageUrl,
      currentValue: `${ctx.redirectChain.length}홉: ${ctx.redirectChain.join(" -> ")} -> ${ctx.finalUrl}`,
      recommendedValue: "단일 홉으로 단축(원본 -> 최종 직접 연결)",
    };
  },
};
