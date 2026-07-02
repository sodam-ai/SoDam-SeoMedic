import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { launchGuardedBrowser, renderAndExtractSignals, installSsrfGuardedRouting } from "../../src/render/browser-pool.js";
import { SsrfBlockedError } from "../../src/crawler/ssrf-guard.js";

let browser: Browser;

beforeAll(async () => {
  browser = await launchGuardedBrowser();
}, 30_000);

afterAll(async () => {
  await browser.close();
});

describe("renderAndExtractSignals — 실제 브라우저 렌더링(공인 사이트)", () => {
  it("example.com을 실제로 렌더링해 신호를 추출한다", async () => {
    const result = await renderAndExtractSignals(browser, "https://example.com/");
    expect(result.statusCode).toBe(200);
    expect(result.signals.title).toBe("Example Domain");
  }, 20_000);

  it("사설 IP 리터럴 대상은 브라우저 실행 전에 즉시 차단(assertSafeUrl)", async () => {
    await expect(renderAndExtractSignals(browser, "http://127.0.0.1:9/x")).rejects.toThrow(SsrfBlockedError);
  });
});

describe("installSsrfGuardedRouting — 브라우저 자체 네트워크 요청 차단(실제 검증)", () => {
  let server: http.Server;
  let localUrl: string;

  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end("<html><body>secret</body></html>"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    localUrl = `http://127.0.0.1:${port}/`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("route 가드가 설치된 페이지는 사설 IP(127.0.0.1) 서버로의 실제 이동을 차단한다", async () => {
    // renderAndExtractSignals의 진입 assertSafeUrl을 우회해 route 핸들러 자체를 직접 검증한다
    // (진입 게이트는 위 테스트에서 이미 확인했으므로, 여기서는 오직 route 메커니즘만 본다).
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await installSsrfGuardedRouting(page);
      let navigationError: unknown;
      try {
        await page.goto(localUrl, { timeout: 5000 });
      } catch (err) {
        navigationError = err;
      }
      // route.abort()로 막히면 Playwright는 net::ERR_FAILED 계열 예외를 던진다 — 정상 응답(secret 노출)이 아니어야 함
      expect(navigationError).toBeDefined();
    } finally {
      await context.close();
    }
  }, 15_000);

  it("가드 없는 일반 페이지는(대조군) 같은 로컬 서버에 정상 접속된다", async () => {
    // route 가드 자체가 로컬 서버 접속을 원천적으로 막는 환경 문제가 아님을 증명하는 대조군.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const res = await page.goto(localUrl, { timeout: 5000 });
      expect(res?.status()).toBe(200);
      const text = await page.textContent("body");
      expect(text).toContain("secret");
    } finally {
      await context.close();
    }
  }, 15_000);
});
