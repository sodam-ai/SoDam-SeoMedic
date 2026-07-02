import type { Rule, RuleViolation } from "../types.js";

const VERSION = 1;

// Google 공식 Core Web Vitals 임계값("Good" 상한)
const LCP_GOOD_THRESHOLD_MS = 2500;
const CLS_GOOD_THRESHOLD = 0.1;

export const cwvLcpPoorRule: Rule = {
  id: "R-CWV-LCP-POOR",
  version: VERSION,
  category: "cwv",
  evaluate(ctx): RuleViolation | null {
    if (ctx.cwv?.lcpMs == null) return null; // CWV 미측정 페이지는 조용히 skip(강제 아님)
    if (ctx.cwv.lcpMs <= LCP_GOOD_THRESHOLD_MS) return null;
    return {
      ruleId: "R-CWV-LCP-POOR",
      ruleVersion: VERSION,
      category: "cwv",
      severity: "high",
      pageUrl: ctx.pageUrl,
      currentValue: `LCP ${Math.round(ctx.cwv.lcpMs)}ms (lab, 3회 중앙값)`,
      recommendedValue: `${LCP_GOOD_THRESHOLD_MS}ms 이하 목표`,
    };
  },
};

export const cwvClsPoorRule: Rule = {
  id: "R-CWV-CLS-POOR",
  version: VERSION,
  category: "cwv",
  evaluate(ctx): RuleViolation | null {
    if (ctx.cwv?.clsUnitless == null) return null;
    if (ctx.cwv.clsUnitless <= CLS_GOOD_THRESHOLD) return null;
    return {
      ruleId: "R-CWV-CLS-POOR",
      ruleVersion: VERSION,
      category: "cwv",
      severity: "high",
      pageUrl: ctx.pageUrl,
      currentValue: `CLS ${ctx.cwv.clsUnitless.toFixed(3)} (lab, 3회 중앙값)`,
      recommendedValue: `${CLS_GOOD_THRESHOLD} 이하 목표`,
    };
  },
};
