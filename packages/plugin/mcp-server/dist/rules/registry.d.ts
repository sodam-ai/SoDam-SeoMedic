import type { Rule, RuleContext, RuleViolation } from "./types.js";
export declare const ALL_RULES: Rule[];
export declare function evaluateAllRules(ctx: RuleContext, rules?: Rule[]): RuleViolation[];
