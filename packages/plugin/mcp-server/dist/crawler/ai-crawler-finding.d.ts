import type { RuleViolation } from "../rules/types.js";
import { type AiCrawlerAccessReport } from "./ai-crawler-policy.js";
export declare const AI_CRAWLER_POLICY_RULE_ID = "R-AI-CRAWLER-POLICY";
export declare const AI_CRAWLER_POLICY_RULE_VERSION = 1;
/**
 * 사이트 단위(페이지 단위 아님) Finding 1개만 생성한다 — rules/registry.ts의 페이지 단위 RuleContext로는
 * 표현 불가능한 판정이라(robots.txt는 사이트 전역 정책) fixers/sitemap-finding.ts와 동일한 패턴을 따른다:
 * 순수 함수가 RuleViolation을 직접 조립하고, evaluateAllRules를 거치지 않는다.
 *
 * 중립 보고만 한다 — "학습봇 차단 권장" 같은 특정 정책을 권고하지 않는다(03_PHASES.md:99가 제안한 정책
 * 채택 여부는 이 세션에서 사용자 확인을 받지 않은 별도 결정 사항이라 코드가 대신 판단하지 않는다).
 */
export declare function buildAiCrawlerPolicyViolation(origin: string, report: AiCrawlerAccessReport): RuleViolation;
