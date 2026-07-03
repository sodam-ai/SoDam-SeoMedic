import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchLocalNextServer, RenderBridgeError } from "../../src/render-bridge/server-launcher.js";
import { fetchLocalBridgeHtml } from "../../src/render-bridge/local-fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/nextjs-minimal");

/**
 * 실제 Next.js 프로젝트로 build→start→헬스체크→raw HTML 획득→stop()까지 전체 파이프라인을 검증한다.
 * 목업이 아니라 진짜 next 바이너리를 실행한다(빌드 포함이라 느림 — 넉넉한 타임아웃).
 */
describe("launchLocalNextServer — 실제 Next.js 프로젝트(빌드+기동)", () => {
  it("build→start→127.0.0.1 헬스체크까지 실제로 통과하고, raw HTML도 정상 획득한다", async () => {
    const server = await launchLocalNextServer({ projectRoot: FIXTURE_ROOT });
    try {
      expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.port).toBeGreaterThan(0);

      const result = await fetchLocalBridgeHtml(server.origin + "/", server.origin);
      expect(result.status).toBe(200);
      expect(result.html).toContain("SeoMedic 테스트 픽스처");
    } finally {
      await server.stop();
    }
  }, 180_000);

  it("존재하지 않는 프로젝트 경로(next 없음)는 즉시 RenderBridgeError", async () => {
    const emptyDir = path.resolve(__dirname, "../fixtures"); // next가 없는 폴더
    await expect(launchLocalNextServer({ projectRoot: emptyDir })).rejects.toThrow(RenderBridgeError);
  }, 15_000);
});
