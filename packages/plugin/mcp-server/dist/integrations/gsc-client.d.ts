import { type AccessTokenProvider } from "./google-auth-token.js";
import type { GscClient } from "./types.js";
export declare class GscApiError extends Error {
}
export interface GscFetcherResult {
    status: number;
    bodyText: string;
}
export type GscFetcher = (url: string, init: {
    headers: Record<string, string>;
    body: string;
}) => Promise<GscFetcherResult>;
/**
 * Google Search Console(Search Analytics) 실제 REST 클라이언트. PSI(단순 API 키)와 달리 서비스계정
 * OAuth2가 필요해 google-auth-library로 액세스 토큰을 먼저 얻은 뒤, 그 토큰으로 이 파일이 직접
 * `searchAnalytics.query`를 POST 호출한다(googleapis 전체 SDK 대신 필요한 엔드포인트 하나만 얇게
 * 구현 — Simplicity First).
 *
 * `dimensions`를 빈 배열로 보내면(공식 문서 확인) 페이지·쿼리별 세부 분류 없이 지정 기간 전체의 집계
 * 행 1개만 돌아온다 — 이 포트가 요구하는 "요약값 하나"에 정확히 맞는 형태라 별도 합산 로직이 불필요.
 * `rows`가 없거나 비어 있으면 그 기간에 집계할 활동이 없다는 뜻(그 기간 데이터가 아직 처리 전이거나
 * 완전히 0일 수 있음 — 어느 쪽이든 값을 지어내지 않고 0으로 정직하게 표현한다).
 *
 * fetcher/tokenProvider 둘 다 DI — 실제 프로덕션 값이 기본값이고, 테스트는 실제 서비스계정·네트워크
 * 없이 canned 토큰·canned 응답을 주입한다(psi-client.ts와 동일한 이유: Google 서버 호출은 느리고
 * 비결정적이라 CI에 부적합).
 */
export declare function createGscClient(keyFilePath: string, fetcher?: GscFetcher, tokenProvider?: AccessTokenProvider): GscClient;
