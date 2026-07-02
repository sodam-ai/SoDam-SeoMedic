import { isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
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
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // 형식이 이상하면 안전 측(차단)으로
  }
  const [a, b] = parts;

  if (a === 127) return true; // 루프백 127.0.0.0/8
  if (a === 10) return true; // 사설 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 사설 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 사설 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 링크로컬(클라우드 메타데이터 169.254.169.254 포함)
  if (a === 0) return true; // "이 네트워크" 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // 멀티캐스트(224+)·예약(240+)·브로드캐스트(255.255.255.255)

  return false;
}

/**
 * IPv6 주소가 사설/루프백/링크로컬/ULA/IPv4-매핑 사설대역인지 판정한다.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true; // 루프백
  if (normalized === "::") return true; // 미지정 주소
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // 링크로컬 fe80::/10
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true; // ULA fc00::/7
  }

  // IPv4-매핑 IPv6 (::ffff:127.0.0.1 형태) — 내부 IPv4 부분을 다시 검사
  const mappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch) {
    return isPrivateIPv4(mappedMatch[1]);
  }

  return false;
}

export function isPrivateOrReservedIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // isIP()가 인식 못 하는 형식(8진수/16진수/정수 표기 등)은 안전 측 차단
}

export interface SsrfCheckResult {
  hostname: string;
  resolvedIP: string;
}

/**
 * URL의 스킴과 호스트를 검증하고, 실제 DNS 조회 결과 IP까지 사설/예약 대역인지 확인한다.
 * DNS 리바인딩(1차 조회 시 공인 IP, 실제 연결 시점엔 사설 IP로 바뀌는 TOCTOU 공격)을 막으려면
 * 이 함수가 반환한 resolvedIP를 실제 소켓 연결에도 강제로 사용해야 한다(fetch-client.ts에서 처리).
 */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`유효하지 않은 URL: ${rawUrl}`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(`허용되지 않은 스킴: ${url.protocol} (http/https만 허용)`);
  }

  // hostname 자체가 이미 IP 리터럴인 경우 즉시 판정 가능
  if (isIP(url.hostname) > 0 && isPrivateOrReservedIP(url.hostname)) {
    throw new SsrfBlockedError(`사설/예약 IP 직접 접근 차단: ${url.hostname}`);
  }

  return url;
}

export function resolveAndCheck(hostname: string): Promise<SsrfCheckResult> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: false }, (err, address: string) => {
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
