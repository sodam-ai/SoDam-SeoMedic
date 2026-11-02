import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { startSsrfProxy, type SsrfProxy, type SsrfProxyOptions } from "../../src/cwv/ssrf-proxy.js";

/**
 * Lighthouse용 SSRF 프록시(PRD 04 M1). 외부 네트워크 없이 로컬 서버로 검증한다.
 *  - 기본 정책: 사설/loopback/메타데이터 목적지는 **연결하지 않고** 거부해야 한다(대상 서버가 요청을 받지 못함).
 *  - 주입 정책: 로컬 서버를 "허용된 대상"으로 쓸 수 있게 판정만 바꿔, 전달·리다이렉트·터널링 동작 자체를 검증한다.
 * 실제 HTTPS 경로는 lighthouse-runner.test.ts의 example.com 실측 테스트가 맡는다.
 */

interface Target {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

let proxy: SsrfProxy | null = null;
const targets: Target[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await proxy?.close();
  proxy = null;
  await Promise.all(targets.splice(0).map((t) => t.close()));
});

function startTarget(onRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<Target> {
  return new Promise((resolve) => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url ?? "");
      if (onRequest) {
        onRequest(req, res);
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("target-ok");
    });
    server.listen(0, "127.0.0.1", () => {
      const target: Target = {
        port: (server.address() as AddressInfo).port,
        hits,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      };
      targets.push(target);
      resolve(target);
    });
  });
}

async function startProxy(options?: SsrfProxyOptions): Promise<SsrfProxy> {
  proxy = await startSsrfProxy(options);
  return proxy;
}

/** Host 헤더용. 상대경로 같은 잘못된 입력은 그대로 프록시에 보내 400을 확인해야 하므로 파싱 실패를 허용한다. */
function hostOf(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return "localhost";
  }
}

/** 브라우저가 프록시로 보내는 형태(absolute-form 요청 라인)를 흉내 낸다. */
function viaProxyGet(
  proxyPort: number,
  absoluteUrl: string,
  extraHeaders: http.OutgoingHttpHeaders = {},
  method = "GET",
  body?: string,
): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method,
        path: absoluteUrl,
        headers: { host: hostOf(absoluteUrl), ...extraHeaders },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, location: res.headers.location }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function viaProxyConnect(proxyPort: number, authority: string): Promise<{ status: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: proxyPort, method: "CONNECT", path: authority });
    req.on("connect", (res, socket) => {
      sockets.push(socket);
      resolve({ status: res.statusCode ?? 0, socket });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("SSRF 프록시 — 기본 정책: 사설/loopback/메타데이터 목적지는 연결 전에 거부", () => {
  it("loopback IP 리터럴: 403이고 대상 서버는 요청을 받지 못한다", async () => {
    const target = await startTarget();
    const p = await startProxy();
    const res = await viaProxyGet(p.port, `http://127.0.0.1:${target.port}/secret`);
    expect(res.status).toBe(403);
    expect(target.hits).toEqual([]);
    expect(p.blocked[0]?.target).toBe(`127.0.0.1:${target.port}`);
  });

  it("클라우드 메타데이터 주소(링크로컬): 네트워크 접근 없이 403", async () => {
    const p = await startProxy();
    const res = await viaProxyGet(p.port, "http://169.254.169.254/latest/meta-data/");
    expect(res.status).toBe(403);
    expect(p.blocked.map((b) => b.target)).toContain("169.254.169.254:80");
  });

  it("사설 대역(10.x)과 IPv6 loopback 리터럴도 거부", async () => {
    const p = await startProxy();
    expect((await viaProxyGet(p.port, "http://10.0.0.1:8080/")).status).toBe(403);
    expect((await viaProxyGet(p.port, "http://[::1]:8080/")).status).toBe(403);
    expect(p.blocked.length).toBe(2);
  });

  it("호스트 이름이 loopback으로 해석되면 연결 시점의 DNS 가드가 거부(이름으로 우회 불가)", async () => {
    const target = await startTarget();
    const p = await startProxy();
    const res = await viaProxyGet(p.port, `http://localhost:${target.port}/`);
    expect(res.status).toBe(403);
    expect(target.hits).toEqual([]);
    expect(p.blocked[0]?.target).toBe(`localhost:${target.port}`);
  });

  it("CONNECT(HTTPS 터널)도 같은 정책: loopback·사설 목적지는 403", async () => {
    const target = await startTarget();
    const p = await startProxy();
    const toLoopback = await viaProxyConnect(p.port, `127.0.0.1:${target.port}`);
    expect(toLoopback.status).toBe(403);
    const toPrivate = await viaProxyConnect(p.port, "10.0.0.1:443");
    expect(toPrivate.status).toBe(403);
    expect(target.hits).toEqual([]);
  });

  it("형식이 틀린 요청은 400 — 상대경로 요청·포트 없는 CONNECT·http가 아닌 스킴", async () => {
    const p = await startProxy();
    expect((await viaProxyGet(p.port, "/relative-path")).status).toBe(400);
    expect((await viaProxyGet(p.port, "ftp://example.com/file")).status).toBe(400);
    expect((await viaProxyConnect(p.port, "no-port-here")).status).toBe(400);
  });
});

describe("SSRF 프록시 — 주입 정책(로컬 서버를 허용 대상으로): 전달 동작 검증", () => {
  async function startWithAllowedPort(allowedPort: () => number): Promise<SsrfProxy> {
    return startProxy({ isBlockedIp: () => false, allowTarget: (_host, port) => port === allowedPort() });
  }

  it("허용된 대상은 그대로 전달한다(상태·본문)", async () => {
    const target = await startTarget();
    const p = await startWithAllowedPort(() => target.port);
    const res = await viaProxyGet(p.port, `http://127.0.0.1:${target.port}/page?q=1`);
    expect(res.status).toBe(200);
    expect(res.body).toBe("target-ok");
    expect(target.hits).toEqual(["/page?q=1"]);
    expect(p.blocked).toEqual([]);
  });

  it("리다이렉트 홉 차단: 허용 대상의 302는 그대로 전달되고, 그 Location(불허 대상)을 따라가면 403 — 목적지는 요청을 못 받는다", async () => {
    const hidden = await startTarget();
    const entry = await startTarget((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${hidden.port}/internal` });
      res.end();
    });
    const p = await startWithAllowedPort(() => entry.port);

    const first = await viaProxyGet(p.port, `http://127.0.0.1:${entry.port}/start`);
    expect(first.status).toBe(302);
    expect(first.location).toBe(`http://127.0.0.1:${hidden.port}/internal`);

    const followed = await viaProxyGet(p.port, first.location!);
    expect(followed.status).toBe(403);
    expect(hidden.hits).toEqual([]);
    expect(p.blocked[0]?.target).toBe(`127.0.0.1:${hidden.port}`);
  });

  it("요청 본문을 전달하고, hop-by-hop 헤더(proxy-authorization)는 목적지에 넘기지 않는다", async () => {
    let seenHeaders: http.IncomingHttpHeaders = {};
    const target = await startTarget((req, res) => {
      seenHeaders = req.headers;
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`echo:${body}`);
      });
    });
    const p = await startWithAllowedPort(() => target.port);
    const res = await viaProxyGet(
      p.port,
      `http://127.0.0.1:${target.port}/submit`,
      { "proxy-authorization": "Basic c2VjcmV0", "content-type": "text/plain" },
      "POST",
      "payload-123",
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe("echo:payload-123");
    expect(seenHeaders["proxy-authorization"]).toBeUndefined();
  });

  it("CONNECT 터널: 허용 대상으로는 200 후 바이트가 양방향으로 흐르고, 불허 포트는 403", async () => {
    const echo = net.createServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
    const echoPort = (echo.address() as AddressInfo).port;
    try {
      const p = await startWithAllowedPort(() => echoPort);

      const tunnel = await viaProxyConnect(p.port, `127.0.0.1:${echoPort}`);
      expect(tunnel.status).toBe(200);
      const received = await new Promise<string>((resolve) => {
        tunnel.socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
        tunnel.socket.write("ping-through-tunnel");
      });
      expect(received).toBe("ping-through-tunnel");

      const denied = await viaProxyConnect(p.port, `127.0.0.1:${echoPort + 1}`);
      expect(denied.status).toBe(403);
    } finally {
      // net.Server.close()는 열린 연결이 모두 끝나야 완료된다 — 터널(클라이언트 소켓·프록시)을 먼저 닫는다.
      for (const s of sockets.splice(0)) s.destroy();
      await proxy?.close();
      proxy = null;
      await new Promise<void>((resolve) => echo.close(() => resolve()));
    }
  });

  it("차단 기록은 최대 50개로 제한된다(메모리 무한 증가 방지)", async () => {
    const p = await startProxy();
    for (let i = 0; i < 55; i++) await viaProxyGet(p.port, `http://10.0.0.${(i % 250) + 1}:81/`);
    expect(p.blocked.length).toBe(50);
  });

  it("close() 이후에는 더 이상 연결을 받지 않는다", async () => {
    const p = await startProxy();
    const port = p.port;
    await p.close();
    proxy = null;
    await expect(viaProxyGet(port, "http://10.0.0.1/")).rejects.toThrow();
  });

  it("127.0.0.1에만 바인딩한다(외부 인터페이스에 열지 않음)", async () => {
    const p = await startProxy();
    const info = await new Promise<net.AddressInfo>((resolve, reject) => {
      const probe = net.connect(p.port, "127.0.0.1", () => {
        resolve(probe.address() as net.AddressInfo);
        probe.destroy();
      });
      probe.on("error", reject);
    });
    expect(info.address).toBe("127.0.0.1");
  });
});
