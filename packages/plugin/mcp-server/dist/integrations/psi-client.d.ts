import type { PsiClient } from "./types.js";
export declare class PsiApiError extends Error {
}
export interface PsiFetcherResult {
    status: number;
    bodyText: string;
}
export type PsiFetcher = (url: string) => Promise<PsiFetcherResult>;
/**
 * Google PSI v5 runPagespeed를 호출해 loadingExperience(CrUX field 데이터)만 뽑는다. lab 데이터는
 * 이미 cwv/lighthouse-runner.ts가 우리 자신의 Lighthouse 실행으로 확보하므로 PSI 응답의
 * lighthouseResult(같은 응답에 항상 포함됨 — API가 끌 방법을 제공하지 않음, 공식 문서로 확인)는 무시한다.
 *
 * CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile은 CLS 값에 100을 곱한 정수다 — 공식 문서 예시
 * (percentile 20 + category "AVERAGE")로 확인: CLS 0.20은 실제로 "개선 필요(AVERAGE)" 등급과
 * 일치하지만 CLS "20"은 그 자체로 무의미한 값이라 스케일링이 맞다는 정황까지 교차 확인했다.
 * LCP/INP는 밀리초 단위 그대로. ⚠️ 이 스케일링은 실제 API 키로 아직 재검증하지 못했다(공개 문서
 * 기준 — CHECKPOINT.md에 정직하게 남긴다).
 *
 * fetcher는 기본값(safeFetch 기반)이 실제 프로덕션 동작이고, 테스트는 실제 키·네트워크 없이 canned
 * 응답을 주입한다(crawler/sitemap.ts의 SitemapFetcher와 동일한 DI 패턴 — Google 서버 호출은 느리고
 * (수십초) 결정적이지 않아 CI에 부적합하다는 이 저장소의 기존 판단과 일관됨).
 */
export declare function createPsiClient(apiKey: string, fetcher?: PsiFetcher): PsiClient;
