export declare class SsrfBlockedError extends Error {
    constructor(reason: string);
}
export declare function isPrivateOrReservedIP(ip: string): boolean;
export interface SsrfCheckResult {
    hostname: string;
    resolvedIP: string;
}
/**
 * URL의 스킴과 호스트를 검증하고, 실제 DNS 조회 결과 IP까지 사설/예약 대역인지 확인한다.
 * DNS 리바인딩(1차 조회 시 공인 IP, 실제 연결 시점엔 사설 IP로 바뀌는 TOCTOU 공격)을 막으려면
 * 이 함수가 반환한 resolvedIP를 실제 소켓 연결에도 강제로 사용해야 한다(fetch-client.ts에서 처리).
 */
export declare function assertSafeUrl(rawUrl: string): URL;
export declare function resolveAndCheck(hostname: string): Promise<SsrfCheckResult>;
