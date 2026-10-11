export interface BlockedRequest {
    /** "host:port" — 크롤한 페이지의 본문이 아니라 목적지 식별자만 기록한다(저장·재배포 금지 원칙). */
    target: string;
    reason: string;
}
export interface SsrfProxyOptions {
    /**
     * 연결 직전 IP 판정. 기본값은 사설/예약 대역 차단(프로덕션 정책).
     * 로컬 서버로 동작을 검증하는 테스트에서만 재정의한다.
     */
    isBlockedIp?: (ip: string) => boolean;
    /** (테스트 전용) host:port 사전 판정 — false면 거부. 기본은 모두 통과(IP 판정이 담당). */
    allowTarget?: (host: string, port: number) => boolean;
}
export interface SsrfProxy {
    /** Chromium에 `--proxy-server=http://127.0.0.1:<port>`로 넘긴다. */
    port: number;
    /** 지금까지 차단한 요청(최대 50개). close() 이후에도 읽을 수 있다. */
    blocked: BlockedRequest[];
    close(): Promise<void>;
}
export declare function startSsrfProxy(options?: SsrfProxyOptions): Promise<SsrfProxy>;
