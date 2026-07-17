export class LocalBridgeError extends Error {
    constructor(message) {
        super(`렌더 브릿지 로컬 검증 실패: ${message}`);
        this.name = "LocalBridgeError";
    }
}
/**
 * 일반 크롤러의 SSRF 가드(crawler/ssrf-guard.ts의 assertSafeUrl)를 이 함수는 절대 호출하지 않는다.
 * 렌더 브릿지가 접속하는 대상은 "신뢰 불가 임의 URL"이 아니라 "이 프로세스가 방금 스폰한, 자신이
 * 고른 포트에 127.0.0.1로만 바인딩한 서버"라 신뢰 모델이 근본적으로 다르다(Plan Mode 설계 근거 그대로).
 * 이 함수는 crawler/* 에서 절대 import하지 않는다 — 그러면 SSRF 가드의 "예외 없는 차단" 보장이 깨진다.
 *
 * 검증 기준(둘 다 만족해야 통과):
 * 1. 호스트가 정확히 "127.0.0.1" 리터럴이어야 한다 — "localhost" 문자열은 명시적으로 거부한다.
 *    hosts 파일이나 DNS 설정을 조작해 "localhost"가 다른 IP로 매핑되는 경우를 원천적으로 배제하기 위함.
 * 2. origin(스킴+호스트+포트)이 이번 실행에서 실제로 뽑은 값과 완전히 일치해야 한다(접두어/포함 비교 금지).
 */
export function assertLocalBridgeUrl(rawUrl, expectedOrigin) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new LocalBridgeError(`유효하지 않은 URL: ${rawUrl}`);
    }
    if (url.protocol !== "http:") {
        throw new LocalBridgeError(`허용되지 않은 스킴: ${url.protocol} (로컬 브릿지는 http만 허용)`);
    }
    if (url.hostname !== "127.0.0.1") {
        throw new LocalBridgeError(`호스트가 127.0.0.1 리터럴이 아님: ${url.hostname} (localhost 등 도메인 이름 금지)`);
    }
    if (url.origin !== expectedOrigin) {
        throw new LocalBridgeError(`origin 불일치: ${url.origin} !== ${expectedOrigin}`);
    }
    return url;
}
//# sourceMappingURL=local-loopback.js.map