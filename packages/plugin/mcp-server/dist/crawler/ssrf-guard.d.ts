import { type LookupOneOptions, type LookupAllOptions } from "node:dns";
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
/**
 * DNS 조회 시점에 사설/예약 IP를 걸러내는 dns.lookup 호환 함수를 만든다.
 * 이 lookup을 소켓 연결(undici Agent의 connect 옵션, net.connect/http.request의 lookup 옵션)에 연결하면,
 * 실제 연결 직전에 해석된 **모든** 주소를 검사하고 그 주소로만 연결하므로 "1차 조회는 공인 IP, 연결 시점엔
 * 사설 IP로 바뀌는" DNS 리바인딩(TOCTOU)을 막는다. 주소 중 하나라도 차단 대상이면 전체를 거부한다(fail-closed).
 * 차단되면 `code: "ESSRFBLOCKED"` 오류로 콜백한다. 크롤러(fetch-client)와 Lighthouse용 프록시(cwv/ssrf-proxy)가
 * 같은 판정을 쓰도록 한 곳에 둔다.
 *
 * `isBlockedIp`는 기본값(사설/예약 대역 차단)이 프로덕션 정책이다. 테스트에서 로컬 서버로 검증할 때만 재정의한다.
 */
export declare function createSsrfSafeLookup(isBlockedIp?: (ip: string) => boolean): (hostname: string, options: LookupOneOptions | LookupAllOptions | number, callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void) => void;
export declare function resolveAndCheck(hostname: string): Promise<SsrfCheckResult>;
