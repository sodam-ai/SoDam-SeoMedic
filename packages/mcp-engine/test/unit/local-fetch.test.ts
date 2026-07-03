import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchLocalBridgeHtml } from "../../src/render-bridge/local-fetch.js";
import { LocalBridgeError } from "../../src/render-bridge/local-loopback.js";

let servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

function startServer(handler: http.RequestListener): Promise<{ origin: string; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, port });
    });
  });
}

describe("fetchLocalBridgeHtml — 실제 로컬 HTTP 서버", () => {
  it("정상 응답을 가져온다", async () => {
    const { origin } = await startServer((_req, res) => res.end("<html><body>hello</body></html>"));
    const result = await fetchLocalBridgeHtml(origin + "/", origin);
    expect(result.status).toBe(200);
    expect(result.html).toContain("hello");
  });

  it("origin이 다르면(다른 포트) LocalBridgeError로 즉시 거부(fetch 시도 자체 안 함)", async () => {
    const { origin } = await startServer((_req, res) => res.end("ok"));
    await expect(fetchLocalBridgeHtml(origin + "/", "http://127.0.0.1:1")).rejects.toThrow(LocalBridgeError);
  });

  it("404 등 비정상 상태코드도 그대로 반환(에러 아님 — 규칙 평가는 상위 계층 몫)", async () => {
    const { origin } = await startServer((_req, res) => {
      res.statusCode = 404;
      res.end("not found");
    });
    const result = await fetchLocalBridgeHtml(origin + "/missing", origin);
    expect(result.status).toBe(404);
  });
});
