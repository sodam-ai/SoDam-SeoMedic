import http from "node:http";
import net, { isIP, type AddressInfo, type Socket } from "node:net";
import { createSsrfSafeLookup, isPrivateOrReservedIP } from "../crawler/ssrf-guard.js";

/**
 * Lighthouse가 띄운 Chromium의 **모든 네트워크 요청**에 SSRF 가드를 거는 로컬 전달 프록시(PRD 04 M1).
 *
 * 왜 프록시인가: Lighthouse는 CDP로 연결한 뒤 자체적으로 페이지를 만들어 이동을 관리하므로 M2 render처럼
 * page.route()로 요청마다 재검증할 수 없다. 진입 URL만 검증하면 서버가 Chromium에게만 사설 주소로 리다이렉트하거나
 * (크롤러와 구분 가능) JS/서브리소스가 내부망을 부르는 경우를 못 막는다. 2026-10-11 실측(Lighthouse 13.4.1):
 *  - 진입 서버 A가 302로 내부 서버 B를 가리키면 B에 요청이 실제로 도달했다(공백 실재).
 *  - Lighthouse의 blockedUrlPatterns는 설정은 적용되지만 메인 문서 이동·리다이렉트는 막지 못했다(진입 URL 자체를
 *    차단하는 대조군에서도 요청이 도달) → 단독 방어 불가.
 *  - Chromium을 `--proxy-server=<이 프록시>`로 띄우면 리다이렉트 목적지 도달 0건(Lighthouse는 문서 요청 오류로 중단).
 * Chromium은 목적지 호스트 이름을 프록시에 그대로 넘기므로 DNS 해석을 이 프록시가 하고, 해석된 주소를 검사한 뒤
 * **그 주소로만** 연결한다(DNS 리바인딩 방어 — 크롤러와 같은 createSsrfSafeLookup 사용).
 *
 * 보안 성질: 127.0.0.1에만 바인딩 · 임의 포트 · 측정이 끝나면 닫는다(S5) · 사설/예약 IP·loopback·메타데이터 주소
 * 목적지는 거부(IP 리터럴은 lookup을 거치지 않으므로 별도 검사) · TLS는 종단 간 그대로(CONNECT 터널, MITM 없음).
 * 포트는 제한하지 않는다 — 크롤러(fetch-client)도 제한하지 않으며, 비표준 포트의 정상 사이트를 막아 CWV가 조용히
 * 사라지는 것이 더 나쁘다. 차단 대상은 "어느 포트냐"가 아니라 "어느 IP냐"다.
 * 로컬 프록시를 쓸 수 없는 환경(회사 업스트림 프록시 필수 등)에서는 직접 연결이 실패해 측정이 실패한다 — 크롤러와 같은 제약.
 */

const UPSTREAM_TIMEOUT_MS = 30_000;
const TUNNEL_IDLE_TIMEOUT_MS = 120_000;
const MAX_BLOCKED_RECORDS = 50;
const MAX_AUTHORITY_LENGTH = 300;

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

/** 프록시가 그대로 넘기면 안 되는 hop-by-hop 헤더(RFC 9110 §7.6.1 + 프록시 전용). */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** CONNECT의 authority("host:port" 또는 "[v6]:port")를 파싱한다. 형식이 틀리면 null. */
function parseAuthority(authority: string): { host: string; port: number } | null {
  if (authority.length === 0 || authority.length > MAX_AUTHORITY_LENGTH) return null;
  const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d{1,5})$/.exec(authority);
  if (!match) return null;
  const port = Number(match[3]);
  if (port < 1 || port > 65535) return null;
  return { host: match[1] ?? match[2], port };
}

function copyForwardableHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
    out[name] = value;
  }
  return out;
}

export function startSsrfProxy(options: SsrfProxyOptions = {}): Promise<SsrfProxy> {
  const isBlockedIp = options.isBlockedIp ?? isPrivateOrReservedIP;
  const allowTarget = options.allowTarget ?? (() => true);
  const lookup = createSsrfSafeLookup(isBlockedIp);
  const blocked: BlockedRequest[] = [];
  const tunnels = new Set<Socket>();

  function record(target: string, reason: string): void {
    if (blocked.length < MAX_BLOCKED_RECORDS) blocked.push({ target, reason });
  }

  /** 연결 전에 알 수 있는 거부 사유(없으면 null). 호스트 이름은 연결 시점의 lookup이 다시 검사한다. */
  function preflightBlockReason(host: string, port: number): string | null {
    if (!allowTarget(host, port)) return "허용되지 않은 대상";
    if (isIP(host) > 0 && isBlockedIp(host)) return "사설/예약 IP 직접 접근";
    return null;
  }

  const server = http.createServer((req, res) => {
    function reject(status: number, message: string): void {
      if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      res.end(message);
    }

    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      reject(400, "proxy request must use absolute-form URL");
      return;
    }
    if (url.protocol !== "http:") {
      reject(400, "only http: absolute-form requests are proxied (https uses CONNECT)");
      return;
    }

    const host = stripBrackets(url.hostname);
    const port = url.port ? Number(url.port) : 80;
    const target = `${host}:${port}`;
    const preflight = preflightBlockReason(host, port);
    if (preflight) {
      record(target, preflight);
      reject(403, "blocked by SeoMedic SSRF guard");
      return;
    }

    const upstream = http.request(
      {
        host,
        port,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers: copyForwardableHeaders(req.headers),
        lookup: lookup as net.LookupFunction,
        agent: false,
        timeout: UPSTREAM_TIMEOUT_MS,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, copyForwardableHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
    upstream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ESSRFBLOCKED") {
        record(target, "DNS 결과가 사설/예약 IP");
        reject(403, "blocked by SeoMedic SSRF guard");
      } else if (res.headersSent) {
        res.destroy();
      } else {
        reject(502, "upstream connection failed");
      }
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });

  // HTTPS: CONNECT host:port — 목적지를 검사하고 통과하면 TCP 터널만 열어 준다(TLS는 Chromium↔원 서버 종단 간).
  server.on("connect", (req, clientSocket: Socket, head: Buffer) => {
    tunnels.add(clientSocket);
    clientSocket.on("close", () => tunnels.delete(clientSocket));
    clientSocket.on("error", () => clientSocket.destroy());

    function deny(status: number, text: string): void {
      if (!clientSocket.destroyed) clientSocket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    }

    const parsed = parseAuthority(req.url ?? "");
    if (!parsed) {
      deny(400, "Bad Request");
      return;
    }
    const host = stripBrackets(parsed.host);
    const target = `${host}:${parsed.port}`;
    const preflight = preflightBlockReason(host, parsed.port);
    if (preflight) {
      record(target, preflight);
      deny(403, "Forbidden");
      return;
    }

    // noDelay: 터널은 TLS 핸드셰이크 같은 작은 조각을 주고받는다 — Nagle 알고리즘이 켜져 있으면 지연 ACK과 겹쳐
    // 조각마다 약 40ms씩 지연될 수 있어(실측: example.com LCP +42ms) 양쪽 소켓 모두 끈다.
    clientSocket.setNoDelay(true);
    const upstream = net.connect({ host, port: parsed.port, lookup: lookup as net.LookupFunction, noDelay: true });
    tunnels.add(upstream);
    upstream.on("close", () => {
      tunnels.delete(upstream);
      clientSocket.destroy();
    });
    clientSocket.on("close", () => upstream.destroy());
    upstream.setTimeout(TUNNEL_IDLE_TIMEOUT_MS, () => upstream.destroy());
    clientSocket.setTimeout(TUNNEL_IDLE_TIMEOUT_MS, () => clientSocket.destroy());
    upstream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ESSRFBLOCKED") {
        record(target, "DNS 결과가 사설/예약 IP");
        deny(403, "Forbidden");
      } else {
        deny(502, "Bad Gateway");
      }
      upstream.destroy();
    });
    upstream.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
  });

  server.on("clientError", (_err, socket) => {
    if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve({
        port: (server.address() as AddressInfo).port,
        blocked,
        close: () =>
          new Promise<void>((resolveClose) => {
            for (const socket of tunnels) socket.destroy();
            tunnels.clear();
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}
