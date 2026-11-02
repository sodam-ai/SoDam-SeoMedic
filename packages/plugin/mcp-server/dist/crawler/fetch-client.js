import { Agent, fetch as undiciFetch } from "undici";
import { assertSafeUrl, createSsrfSafeLookup, SsrfBlockedError } from "./ssrf-guard.js";
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024; // 20MB 상한(zip bomb류·과대 응답 방어)
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
// HTTP 헤더 값은 ByteString(Latin1)만 허용된다 — 비ASCII 문자를 넣으면 undici가 WebIDL 변환에서 즉시 예외를 던진다(실측 확인됨).
const USER_AGENT = "SeoMedicBot/0.1 (+https://github.com/seomedic; diagnostic use only, owner-authorized sites only)";
/**
 * 연결 직전 IP 검사(DNS 리바인딩 방어). 구현은 ssrf-guard의 공유 함수 — Lighthouse용 프록시(cwv/ssrf-proxy)도
 * 같은 판정을 쓰도록 한 곳에 뒀다. 이 lookup을 Agent의 connect 옵션에 연결한다.
 */
const ssrfSafeLookup = createSsrfSafeLookup();
function createSafeAgent() {
    return new Agent({
        connect: {
            lookup: ssrfSafeLookup,
            timeout: DEFAULT_TIMEOUT_MS,
        },
    });
}
export async function safeFetch(rawUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
    const redirectChain = [];
    let currentUrl = assertSafeUrl(rawUrl).toString();
    const agent = createSafeAgent();
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (hop === MAX_REDIRECTS) {
                throw new SsrfBlockedError(`리다이렉트 횟수 초과(${MAX_REDIRECTS}회): ${rawUrl}`);
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            let res;
            try {
                res = await undiciFetch(currentUrl, {
                    method: options.method ?? "GET",
                    body: options.body,
                    redirect: "manual",
                    signal: controller.signal,
                    dispatcher: agent,
                    headers: { ...options.headers, "user-agent": USER_AGENT },
                });
            }
            finally {
                clearTimeout(timer);
            }
            const isRedirect = res.status >= 300 && res.status < 400 && res.headers.has("location");
            if (!isRedirect) {
                const bodyText = await readBodyWithLimit(res, maxBytes);
                return { finalUrl: currentUrl, status: res.status, headers: res.headers, bodyText, redirectChain };
            }
            redirectChain.push(currentUrl);
            currentUrl = resolveRedirectTarget(currentUrl, res.headers.get("location"));
        }
        throw new SsrfBlockedError(`리다이렉트 처리 로직 도달 불가 상태: ${rawUrl}`);
    }
    finally {
        await agent.close();
    }
}
/**
 * 리다이렉트 Location(절대/상대/프로토콜상대 모두 가능)을 현재 URL 기준으로 절대 URL로 만든 뒤
 * assertSafeUrl로 재검증한다. safeFetch의 리다이렉트 루프가 매 홉마다 호출하는 핵심 게이트이며,
 * 여기서 독립적으로 export해 "리다이렉트로 사설 IP를 가리키면 차단되는지"를 네트워크 없이 검증할 수 있게 한다.
 */
export function resolveRedirectTarget(currentUrl, location) {
    const nextUrl = new URL(location, currentUrl);
    return assertSafeUrl(nextUrl.toString()).toString();
}
export async function readBodyWithLimit(res, maxBytes) {
    // undici Response.body는 표준 web ReadableStream — global lib.dom과 undici 자체 타입이
    // 미묘하게 달라 충돌하므로(Symbol.dispose 등) 이 함수 내부에서만 any로 좁혀 사용한다.
    const reader = res.body?.getReader();
    if (!reader)
        return "";
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new SsrfBlockedError(`응답 크기 상한 초과(${maxBytes} bytes)`);
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}
//# sourceMappingURL=fetch-client.js.map