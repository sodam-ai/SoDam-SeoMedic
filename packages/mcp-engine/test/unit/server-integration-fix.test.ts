import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../../dist/server.js");
const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/nextjs-minimal");

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content as Array<{ type: string; text?: string }> | undefined;
  const textContent = content?.find((c) => c.type === "text");
  if (!textContent?.text) throw new Error("텍스트 콘텐츠 없음");
  return textContent.text;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** fix-orchestrator-integration.test.ts와 동일한 격리 방식(별도 git repo + 전체 복사) — MCP 프로토콜 레이어만 다르게 검증. */
function makeIsolatedNextProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-mcp-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.next`) });
  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.mkdirSync(path.join(tempDir, "app", "about"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "app", "about", "page.tsx"), `export default function AboutPage() {\n  return <h1>About</h1>;\n}\n`);
  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n      <a href="/about">About</a>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);
  return tempDir;
}

/**
 * 지금까지의 fix-orchestrator 테스트는 planLocalFix/applyLocalFixes 함수를 직접 호출해 검증했다 —
 * server.ts에 등록한 5개 MCP 툴이 실제 MCP 프로토콜(zod 스키마 포함)로 정상 노출되는지는
 * 별개로 확인된 적이 없다(1.5b가 이 5개 툴의 내부 로직을 그대로 재사용할 계획이라 먼저 닫아야 할 구멍).
 */
describe("MCP 서버 — fix 툴 5개, 실제 stdio 프로세스 간 통신", () => {
  it("seomedic_fix_plan → apply → rollback 전체 흐름이 실제 MCP 프로토콜로 동작한다", async () => {
    const projectRoot = makeIsolatedNextProject();
    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          "seomedic_fix_plan",
          "seomedic_fix_approve",
          "seomedic_fix_reject",
          "seomedic_fix_apply",
          "seomedic_fix_rollback",
        ]),
      );

      const planResult = await client.callTool({ name: "seomedic_fix_plan", arguments: { projectRoot } });
      const planText = textOf(planResult);
      expect(planText).toContain("R-SITEMAP-MISSING-URL");
      expect(planText).toContain("add_safe(auto)");

      const auditRunId = Number(planText.match(/audit_run_id=(\d+)/)?.[1]);
      // 이 픽스처는 h1은 있지만 metadata가 전혀 없어(B-1 확장 이후) R-TITLE-MISSING(gated) fix도
      // 함께 생성될 수 있다 — "첫 번째 fix id"가 항상 sitemap이라고 가정하면 안 되므로, 이 테스트가
      // 실제로 검증하려는 add_safe 수정(R-SITEMAP-MISSING-URL)의 id를 rule_id로 명시적으로 찾는다.
      const fixId = Number(planText.match(/fix id=(\d+) · R-SITEMAP-MISSING-URL/)?.[1]);
      expect(auditRunId).toBeGreaterThan(0);
      expect(fixId).toBeGreaterThan(0);

      const applyResult = await client.callTool({ name: "seomedic_fix_apply", arguments: { projectRoot, auditRunId } });
      const applyText = textOf(applyResult);
      expect(applyText).toContain("applied");

      const sitemapPath = path.join(projectRoot, "app", "sitemap.ts");
      expect(fs.readFileSync(sitemapPath, "utf-8")).toContain("/about");

      const rollbackResult = await client.callTool({ name: "seomedic_fix_rollback", arguments: { projectRoot, fixId } });
      expect(textOf(rollbackResult)).toContain("되돌렸습니다");
      expect(fs.readFileSync(sitemapPath, "utf-8")).not.toContain("/about");
    } finally {
      await client.close();
    }
  }, 240_000);

  it("git dirty 상태면 seomedic_fix_plan이 에러로 죽지 않고 거부 메시지를 텍스트로 반환한다", async () => {
    const projectRoot = makeIsolatedNextProject();
    fs.writeFileSync(path.join(projectRoot, "README.md"), "dirty");

    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const planResult = await client.callTool({ name: "seomedic_fix_plan", arguments: { projectRoot } });
      expect(textOf(planResult)).toContain("수정 계획을 만들 수 없습니다");
    } finally {
      await client.close();
    }
  }, 120_000); // makeIsolatedNextProject()의 node_modules 전체 복사가 Windows CI에서 30s를 넘길 수 있음(2026-08-09 실측)
});
