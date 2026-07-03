import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../../dist/server.js");

/**
 * seomedic_fix_github는 실제 GitHub API로 아직 검증되지 않았다(테스트용 토큰/저장소 필요) —
 * 이 테스트는 "MCP 프로토콜로 정상 노출되는지"만 확인한다. 실제로 호출하지는 않는다
 * (fork·PR 생성처럼 되돌리기 어려운 외부 부작용이 있는 동작이라 자동화 테스트에서 실행 금지).
 */
describe("MCP 서버 — seomedic_fix_github 툴 등록 확인(호출은 하지 않음)", () => {
  it("도구 목록에 seomedic_fix_github이 스키마와 함께 노출된다", async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const githubTool = tools.tools.find((t) => t.name === "seomedic_fix_github");
      expect(githubTool).toBeDefined();
      expect(githubTool!.inputSchema.properties).toHaveProperty("repoUrl");
    } finally {
      await client.close();
    }
  }, 30_000);
});
