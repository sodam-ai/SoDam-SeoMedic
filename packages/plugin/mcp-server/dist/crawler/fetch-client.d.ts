import { type Headers, type Response } from "undici";
export interface SafeFetchResult {
    finalUrl: string;
    status: number;
    headers: Headers;
    bodyText: string;
    redirectChain: string[];
}
/**
 * SSRF 가드 + 크기 상한 + 수동 리다이렉트(매 홉 재검증)를 적용한 안전한 GET.
 * redirect:'manual'로 자동 추적을 끄고, Location 헤더를 직접 읽어 매번 assertSafeUrl+DNS재검증 후 따라간다.
 * (undici fetch의 redirect:'manual'은 서버사이드 컨텍스트에서 opaqueredirect가 아니라 실제 status/location을
 *  그대로 노출한다 — 실측 확인됨, 브라우저의 cross-origin 은닉 규칙이 적용되지 않음)
 */
export interface SafeFetchOptions {
    timeoutMs?: number;
    maxBytes?: number;
    /** 기본 GET. GSC/GA4 client(POST+JSON body+Authorization 헤더)를 위해 추가 — 기존 호출부는
     * 전부 생략하므로 동작 변화 없음(하위호환). */
    method?: string;
    /** user-agent는 항상 고정값을 쓴다(아래 병합 순서상 여기 덮어써도 무시됨) — 식별 가능한 UA
     * 유지가 크롤 정책(04_PROJECT_SPEC "식별 가능한 UA")의 일부이기 때문. */
    headers?: Record<string, string>;
    body?: string;
}
export declare function safeFetch(rawUrl: string, options?: SafeFetchOptions): Promise<SafeFetchResult>;
/**
 * 리다이렉트 Location(절대/상대/프로토콜상대 모두 가능)을 현재 URL 기준으로 절대 URL로 만든 뒤
 * assertSafeUrl로 재검증한다. safeFetch의 리다이렉트 루프가 매 홉마다 호출하는 핵심 게이트이며,
 * 여기서 독립적으로 export해 "리다이렉트로 사설 IP를 가리키면 차단되는지"를 네트워크 없이 검증할 수 있게 한다.
 */
export declare function resolveRedirectTarget(currentUrl: string, location: string): string;
export declare function readBodyWithLimit(res: Response, maxBytes: number): Promise<string>;
