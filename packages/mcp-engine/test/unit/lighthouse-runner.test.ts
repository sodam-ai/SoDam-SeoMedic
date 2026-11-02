import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  median,
  measureCoreWebVitals,
  measureThroughSsrfProxy,
  CwvMeasurementError,
} from "../../src/cwv/lighthouse-runner.js";
import { SsrfBlockedError } from "../../src/crawler/ssrf-guard.js";

describe("median — 순수 로직(네트워크 불필요)", () => {
  it("빈 배열은 null", () => {
    expect(median([])).toBeNull();
  });

  it("홀수 개는 가운데 값", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("짝수 개는 가운데 두 값의 평균", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("NaN/비정상 값은 걸러내고 계산", () => {
    expect(median([1, NaN, 3])).toBe(2);
  });
});

describe("measureCoreWebVitals — 진입 SSRF 가드(네트워크 불필요)", () => {
  it("사설 IP 리터럴은 브라우저 실행 전에 즉시 차단", async () => {
    await expect(measureCoreWebVitals("http://127.0.0.1:9/x")).rejects.toThrow(SsrfBlockedError);
  });
});

describe("measureCoreWebVitals — 실제 Lighthouse 측정(느림, 실제 브라우저+CDP)", () => {
  it("example.com의 LCP/CLS/TBT를 실제로 측정해 중앙값을 낸다", async () => {
    const result = await measureCoreWebVitals("https://example.com/", 2);
    expect(result.runsCompleted).toBe(2);
    expect(result.isLabData).toBe(true);
    expect(result.lcpMs).not.toBeNull();
    expect(result.lcpMs!).toBeGreaterThan(0);
    expect(result.clsUnitless).not.toBeNull();
    expect(result.clsUnitless!).toBeGreaterThanOrEqual(0);
    expect(result.inpProxyTbtMs).not.toBeNull();
    expect(result.inpProxyTbtMs!).toBeGreaterThanOrEqual(0);
    // 정상 공개 사이트는 프록시(SSRF 방어)를 거쳐도 차단 없이 측정돼야 한다 — HTTPS(CONNECT 터널) 실경로 검증
    expect(result.blockedTargets).toBeUndefined();
  }, 60_000);
});

describe("measureThroughSsrfProxy — 리다이렉트·서브리소스 SSRF 차단(실제 Chromium+Lighthouse, 로컬 서버)", () => {
  interface LocalServer {
    port: number;
    hits: string[];
    close(): Promise<void>;
  }
  const servers: LocalServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.close()));
  });

  function startLocalServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<LocalServer> {
    return new Promise((resolve) => {
      const hits: string[] = [];
      const server = http.createServer((req, res) => {
        hits.push(req.url ?? "");
        handler(req, res);
      });
      server.listen(0, "127.0.0.1", () => {
        const local: LocalServer = {
          port: (server.address() as AddressInfo).port,
          hits,
          close: () =>
            new Promise<void>((done) => {
              server.closeAllConnections();
              server.close(() => done());
            }),
        };
        servers.push(local);
        resolve(local);
      });
    });
  }

  const html = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
  const sendHtml = (res: http.ServerResponse, body: string) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html(body));
  };

  it("진입 서버가 내부 서버로 302하면 목적지는 요청을 받지 못하고, 측정은 차단 사유와 함께 실패한다", async () => {
    const internal = await startLocalServer((_req, res) => sendHtml(res, "<h1>internal</h1>"));
    const entry = await startLocalServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${internal.port}/internal-page` });
      res.end();
    });

    // 로컬 서버를 "공개 사이트"로 취급하도록 정책만 주입한다 — 진입 서버만 허용, 나머지는 거부.
    const policy = { isBlockedIp: () => false, allowTarget: (_host: string, port: number) => port === entry.port };
    const error = await measureThroughSsrfProxy(`http://127.0.0.1:${entry.port}/start`, 1, policy).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CwvMeasurementError);
    expect((error as CwvMeasurementError).message).toContain("차단");
    expect((error as CwvMeasurementError).message).toContain(`127.0.0.1:${internal.port}`);
    expect(internal.hits).toEqual([]);
  }, 120_000);

  it("정상 페이지는 프록시를 거쳐도 그대로 측정된다(차단 없음)", async () => {
    const page = await startLocalServer((_req, res) => sendHtml(res, "<h1>hello</h1><p>plain page</p>"));
    const policy = { isBlockedIp: () => false, allowTarget: (_host: string, port: number) => port === page.port };

    const result = await measureThroughSsrfProxy(`http://127.0.0.1:${page.port}/`, 1, policy);

    expect(result.runsCompleted).toBe(1);
    expect(result.lcpMs).not.toBeNull();
    expect(result.blockedTargets).toBeUndefined();
  }, 120_000);

  it("페이지가 불허 대상 서브리소스를 불러도 측정은 유효하고, 차단된 사실이 결과에 남는다", async () => {
    const internal = await startLocalServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("internal-data");
    });
    const page = await startLocalServer((_req, res) =>
      sendHtml(res, `<h1>page</h1><img alt="" src="http://127.0.0.1:${internal.port}/pixel.png">`),
    );
    const policy = { isBlockedIp: () => false, allowTarget: (_host: string, port: number) => port === page.port };

    const result = await measureThroughSsrfProxy(`http://127.0.0.1:${page.port}/`, 1, policy);

    expect(result.runsCompleted).toBe(1);
    expect(result.blockedTargets).toContain(`127.0.0.1:${internal.port}`);
    expect(internal.hits).toEqual([]);
  }, 120_000);
});
