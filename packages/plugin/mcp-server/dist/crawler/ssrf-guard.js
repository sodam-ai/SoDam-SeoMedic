import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";
export class SsrfBlockedError extends Error {
    constructor(reason) {
        super(`SSRF 가드 차단: ${reason}`);
        this.name = "SsrfBlockedError";
    }
}
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
/**
 * IPv4 주소가 사설/루프백/링크로컬/예약 대역인지 판정한다.
 * 10진수 표기(예: 127.0.0.1)만 대상 — 8진수/16진수/정수 표기(예: 0177.0.0.1, 0x7f.0.0.1, 2130706433)는
 * node:net의 isIP()가 애초에 유효한 IPv4로 인정하지 않으므로 이 함수에 도달하기 전에 걸러진다.
 */
function isPrivateIPv4(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
        return true; // 형식이 이상하면 안전 측(차단)으로
    }
    const [a, b] = parts;
    if (a === 127)
        return true; // 루프백 127.0.0.0/8
    if (a === 10)
        return true; // 사설 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31)
        return true; // 사설 172.16.0.0/12
    if (a === 192 && b === 168)
        return true; // 사설 192.168.0.0/16
    if (a === 169 && b === 254)
        return true; // 링크로컬(클라우드 메타데이터 169.254.169.254 포함)
    if (a === 0)
        return true; // "이 네트워크" 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127)
        return true; // CGNAT 100.64.0.0/10
    if (a >= 224)
        return true; // 멀티캐스트(224+)·예약(240+)·브로드캐스트(255.255.255.255)
    return false;
}
/**
 * IPv6 텍스트를 16바이트로 파싱한다(전개형·`::` 압축·끝의 점 표기 IPv4·zone id 지원). 해석 불가면 null.
 * 문자열 접두사 비교로는 같은 주소의 여러 표기("::1"과 "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1"과
 * "::ffff:7f00:1")를 다 잡을 수 없다 — 특히 WHATWG URL 파서는 `[::ffff:127.0.0.1]`을 16진 표기
 * `[::ffff:7f00:1]`로 정규화하므로, 바이트로 풀어 판정해야 한다.
 */
function parseIPv6(ip) {
    let text = ip.split("%")[0]; // zone id(fe80::1%eth0) 제거
    let embeddedIPv4 = null;
    if (text.includes(".")) {
        const lastColon = text.lastIndexOf(":");
        const octets = text.slice(lastColon + 1).split(".").map(Number);
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
            return null;
        embeddedIPv4 = octets;
        text = `${text.slice(0, lastColon + 1)}0:0`; // 끝 32비트 자리를 임시 그룹 2개로 두고 나중에 채운다
    }
    const halves = text.split("::");
    if (halves.length > 2)
        return null;
    const toGroups = (part) => (part === "" ? [] : part.split(":"));
    const head = toGroups(halves[0]);
    const tail = halves.length === 2 ? toGroups(halves[1]) : [];
    const given = head.length + tail.length;
    if (halves.length === 1 ? given !== 8 : given > 7)
        return null;
    const groups = halves.length === 1 ? head : [...head, ...Array(8 - given).fill("0"), ...tail];
    const bytes = [];
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group))
            return null;
        const value = parseInt(group, 16);
        bytes.push(value >> 8, value & 0xff);
    }
    if (embeddedIPv4)
        bytes.splice(12, 4, ...embeddedIPv4);
    return bytes.length === 16 ? bytes : null;
}
/**
 * IPv6 주소가 사설/루프백/링크로컬/ULA/멀티캐스트/예약 대역이거나, 내장된 IPv4가 사설/예약인지 판정한다.
 * 해석 불가한 표기는 안전 측(차단). IPv4를 품는 전환 형식(매핑·NAT64·6to4)은 내장 IPv4로 판정하므로
 * 내장 IPv4가 공인이면 통과시킨다(정상 사용자를 과차단하지 않기 위해).
 */
function isPrivateIPv6(ip) {
    const b = parseIPv6(ip);
    if (!b)
        return true;
    const embeddedIPv4 = (offset) => b.slice(offset, offset + 4).join(".");
    const zeroUntil = (end) => b.slice(0, end).every((x) => x === 0);
    if (zeroUntil(12))
        return true; // ::/96 — 미지정(::)·루프백(::1)·IPv4 호환(::a.b.c.d, 폐기된 형식)
    if (zeroUntil(10) && b[10] === 0xff && b[11] === 0xff)
        return isPrivateIPv4(embeddedIPv4(12)); // ::ffff:0:0/96 IPv4-매핑
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
        if (b.slice(4, 12).every((x) => x === 0))
            return isPrivateIPv4(embeddedIPv4(12)); // 64:ff9b::/96 NAT64
        if (b[4] === 0x00 && b[5] === 0x01)
            return true; // 64:ff9b:1::/48 로컬용 NAT64
    }
    if (b[0] === 0x20 && b[1] === 0x02)
        return isPrivateIPv4(embeddedIPv4(2)); // 2002::/16 6to4
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00)
        return true; // 2001::/32 Teredo
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8)
        return true; // 2001:db8::/32 문서용
    if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0))
        return true; // 100::/64 폐기용
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80)
        return true; // fe80::/10 링크로컬
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0)
        return true; // fec0::/10 사이트 로컬(폐기된 형식)
    if ((b[0] & 0xfe) === 0xfc)
        return true; // fc00::/7 ULA
    if (b[0] === 0xff)
        return true; // ff00::/8 멀티캐스트
    return false;
}
export function isPrivateOrReservedIP(ip) {
    const version = isIP(ip);
    if (version === 4)
        return isPrivateIPv4(ip);
    if (version === 6)
        return isPrivateIPv6(ip);
    return true; // isIP()가 인식 못 하는 형식(8진수/16진수/정수 표기 등)은 안전 측 차단
}
/**
 * URL의 스킴과 호스트를 검증하고, 실제 DNS 조회 결과 IP까지 사설/예약 대역인지 확인한다.
 * DNS 리바인딩(1차 조회 시 공인 IP, 실제 연결 시점엔 사설 IP로 바뀌는 TOCTOU 공격)을 막으려면
 * 이 함수가 반환한 resolvedIP를 실제 소켓 연결에도 강제로 사용해야 한다(fetch-client.ts에서 처리).
 */
export function assertSafeUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new SsrfBlockedError(`유효하지 않은 URL: ${rawUrl}`);
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new SsrfBlockedError(`허용되지 않은 스킴: ${url.protocol} (http/https만 허용)`);
    }
    // hostname 자체가 이미 IP 리터럴인 경우 즉시 판정 가능 (IPv6는 대괄호를 벗긴 형태로 판정한다)
    const host = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
    if (isIP(host) > 0 && isPrivateOrReservedIP(host)) {
        throw new SsrfBlockedError(`사설/예약 IP 직접 접근 차단: ${host}`);
    }
    return url;
}
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
export function createSsrfSafeLookup(isBlockedIp = isPrivateOrReservedIP) {
    return function ssrfSafeLookup(hostname, options, callback) {
        const normalizedOptions = typeof options === "number" ? { family: options } : options;
        dnsLookup(hostname, normalizedOptions, (err, address, family) => {
            if (err) {
                callback(err, address, family);
                return;
            }
            const addresses = Array.isArray(address) ? address : [{ address, family }];
            for (const entry of addresses) {
                const ip = typeof entry === "string" ? entry : entry.address;
                if (isBlockedIp(ip)) {
                    callback(Object.assign(new Error(`SSRF 가드: ${hostname} -> ${ip}는 사설/예약 IP`), {
                        code: "ESSRFBLOCKED",
                    }), undefined, undefined);
                    return;
                }
            }
            callback(err, address, family);
        });
    };
}
export function resolveAndCheck(hostname) {
    return new Promise((resolve, reject) => {
        dnsLookup(hostname, { all: false }, (err, address) => {
            if (err) {
                reject(new SsrfBlockedError(`DNS 조회 실패: ${hostname} (${err.message})`));
                return;
            }
            if (isPrivateOrReservedIP(address)) {
                reject(new SsrfBlockedError(`DNS 조회 결과가 사설/예약 IP: ${hostname} -> ${address}`));
                return;
            }
            resolve({ hostname, resolvedIP: address });
        });
    });
}
//# sourceMappingURL=ssrf-guard.js.map