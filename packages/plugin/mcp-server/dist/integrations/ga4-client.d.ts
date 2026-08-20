import { type AccessTokenProvider } from "./google-auth-token.js";
import type { Ga4Client } from "./types.js";
export declare class Ga4ApiError extends Error {
}
export interface Ga4FetcherResult {
    status: number;
    bodyText: string;
}
export type Ga4Fetcher = (url: string, init: {
    headers: Record<string, string>;
    body: string;
}) => Promise<Ga4FetcherResult>;
/**
 * Google Analytics 4 Data API(`runReport`) 실제 REST 클라이언트. gsc-client.ts와 완전히 동일한
 * 구조(google-auth-library로 토큰 획득 → 이 파일이 직접 REST POST)를 따른다 — 두 클라이언트가 인증
 * 방식을 공유하므로 중복을 최소화하되(google-auth-token.ts 공유), fixer들이 서로 로직을 의도적으로
 * 복제해 온 이 프로젝트의 기존 관례상 REST 호출 자체는 각 파일이 독립적으로 갖는다(서로 다른 API
 * 스키마·에러 처리를 무리하게 하나로 추상화하지 않음).
 *
 * metrics를 sessions·activeUsers 두 개만 요청하고 dimensions는 생략한다(공식 문서 확인 — dimensions
 * 없이 요청하면 지정 기간 전체의 집계 행 1개만 반환) — Ga4MetricsSummary 포트가 요구하는 "요약값
 * 하나"에 정확히 맞는 최소 형태(YAGNI, types.ts 주석과 동일 판단).
 *
 * propertyId는 "properties/" 접두사 없는 순수 ID를 받는다(PRD 04_PROJECT_SPEC.md 환경변수 표
 * "GA4_PROPERTY_ID | GA4 속성 ID" 그대로) — REST 경로에 필요한 `properties/` 접두사는 이 함수가
 * 붙인다(공식 문서의 `{property=properties/*}` 리소스 이름 패턴).
 */
export declare function createGa4Client(keyFilePath: string, fetcher?: Ga4Fetcher, tokenProvider?: AccessTokenProvider): Ga4Client;
