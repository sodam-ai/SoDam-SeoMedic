export interface LocalFetchResult {
    html: string;
    status: number;
}
/**
 * 로컬 렌더 브릿지 서버(127.0.0.1)에서 raw HTML을 가져온다. 호스트가 이미 IP 리터럴이라
 * DNS 조회 자체가 없다 — DNS 리바인딩 계열 공격이 성립할 여지가 원천적으로 없다(설계 근거).
 * crawler/fetch-client.ts의 safeFetch는 내부적으로 assertSafeUrl을 호출해 127.0.0.1을 막으므로
 * 여기서는 쓸 수 없고, readBodyWithLimit(순수 스트림 처리 함수)만 재사용한다.
 */
export declare function fetchLocalBridgeHtml(rawUrl: string, expectedOrigin: string, timeoutMs?: number): Promise<LocalFetchResult>;
