import { type AiCrawlerAccessReport } from "./ai-crawler-policy.js";
interface ParsedRobots {
    isAllowed(url: string, ua?: string): boolean | undefined;
    getCrawlDelay(ua?: string): number | undefined;
    getSitemaps(): string[];
}
/**
 * 위 robots-parser 타입 우회 래퍼를 다른 모듈에서도 재사용할 수 있도록 노출한다(fix-orchestrator/scan.ts가
 * Phase 1.5 로컬 브릿지 전용 fetch 경로에서 이 파서만 필요 — safeFetch는 127.0.0.1을 SSRF로 차단해
 * 이 파일의 fetchRobotsTxtRaw를 재사용할 수 없음, local-fetch.ts의 주석과 동일한 이유).
 */
export declare function parseRobotsTxt(url: string, robotstxt: string): ParsedRobots;
export type { ParsedRobots };
export interface RobotsPolicy {
    isAllowed(url: string): boolean;
    crawlDelaySeconds: number | undefined;
    sitemaps: string[];
}
/**
 * robots.txt를 가져와 정책 객체를 만든다(SeoMedicBot 자신의 크롤 허용 여부 판단용).
 * - absent(없음): 전체 허용으로 취급
 * - unavailable(조회 실패): 정책을 알 수 없으므로 **보수적으로 전체 거부**
 *   (허용 여부가 불확실할 때 크롤을 강행하지 않는다는 원칙 — DO-NOT "권한 없는 사이트 무단 크롤 금지"와 일관)
 */
export declare function loadRobotsPolicy(origin: string): Promise<RobotsPolicy>;
/**
 * robots.txt 기준 알려진 AI 크롤러(GPTBot·ClaudeBot 등)의 접근 정책을 중립적으로 리포트한다
 * (loadRobotsPolicy와 달리 SeoMedicBot 자신의 크롤 여부와 무관 — 사용자에게 보여줄 리포트 전용).
 * - found(200): 실제 규칙 기준으로 봇별 판정
 * - absent(404): robots.txt 자체가 없음 = 전체 허용이 사양상 확정된 사실이므로 리포트 생성
 * - unavailable(5xx·네트워크실패): 정책을 알 수 없음 → **null 반환, 리포트 생성 안 함**
 *   (denyAllPolicy처럼 "전체 차단"으로 추측하면 실제로는 모르는 사실을 안다고 말하는 셈이 된다 — 이건
 *   SeoMedic 자신의 보수적 크롤 결정이지 대상 사이트의 실제 robots.txt 내용이 아니기 때문)
 */
export declare function loadAiCrawlerAccess(origin: string): Promise<AiCrawlerAccessReport | null>;
