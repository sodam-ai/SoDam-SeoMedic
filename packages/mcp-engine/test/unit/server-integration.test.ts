import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../../dist/server.js");

// client.callTool()의 반환 타입은 실험적 task 응답 등 여러 변형의 유니온이라 content가 없는 분기도 있다.
// 테스트 목적상 "content 배열에서 text 타입을 찾는다"만 확인하면 되므로 any로 느슨하게 받는다.
function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content as Array<{ type: string; text?: string }> | undefined;
  const textContent = content?.find((c) => c.type === "text");
  if (!textContent?.text) throw new Error("텍스트 콘텐츠 없음");
  return textContent.text;
}

/**
 * 실제 MCP 클라이언트(SDK 자체 Client)로 서버를 자식 프로세스로 스폰해 stdio로 통신한다.
 * Claude Code가 실제로 하는 것과 동일한 프로토콜 핸드셰이크를 거친다.
 * projectRoot를 임시 디렉터리로 명시해 DB 위치를 테스트가 통제한다(process.cwd() 의존 제거).
 * save_baseline은 재감사를 하지 않으므로(설계 수정 반영) 실제 무거운 audit은 audit 1회 + check 1회뿐이다.
 */
describe("MCP 서버 — 실제 stdio 프로세스 간 통신, 3개 툴 전체 시나리오", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-server-test-"));
  afterAll(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it("audit → save_baseline(재감사 없이 즉시 저장) → check(원복 없음) 전체 흐름이 실제로 동작한다", async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toEqual(expect.arrayContaining(["seomedic_audit", "seomedic_save_baseline", "seomedic_check"]));

      // 1) 진단 — Markdown 리포트가 실제로 나오는지
      const auditResult = await client.callTool({
        name: "seomedic_audit",
        arguments: { url: "https://example.com/", projectRoot },
      });
      const auditText = textOf(auditResult);
      expect(auditText).toContain("SEO 진단 리포트");
      expect(auditText).toContain("R-CANONICAL-MISSING");

      // 2) 베이스라인 없이 check 호출 → 안내 메시지
      const checkNoBaseline = await client.callTool({
        name: "seomedic_check",
        arguments: { url: "https://example.com/", projectRoot },
      });
      expect(textOf(checkNoBaseline)).toContain("베이스라인이 없습니다");

      // 3) 베이스라인 저장 — 방금 1)에서 이미 만든 audit 결과를 그대로 씀(재감사 없음)
      const saveResult = await client.callTool({
        name: "seomedic_save_baseline",
        arguments: { url: "https://example.com/", projectRoot },
      });
      expect(textOf(saveResult)).toContain("베이스라인으로 저장했습니다");

      // 4) 저장 직후 재확인 — 재감사 결과가 baseline과 같은 페이지라 원복 없어야 함
      const checkAfterBaseline = await client.callTool({
        name: "seomedic_check",
        arguments: { url: "https://example.com/", projectRoot },
      });
      expect(textOf(checkAfterBaseline)).toContain("원복된 항목이 없습니다");

      // DB 파일이 지정한 projectRoot 안에 실제로 생겼는지 최종 확인
      expect(fs.existsSync(path.join(projectRoot, ".seomedic", "seomedic.db"))).toBe(true);
    } finally {
      await client.close();
    }
  }, 90_000);
});
