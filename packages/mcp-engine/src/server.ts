#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAudit } from "./orchestrator/audit-orchestrator.js";
import { buildMarkdownReport } from "./report/markdown.js";
import { findOrCreateProject } from "./db/repositories/project.js";
import { findLatestAuditRunByProject } from "./db/repositories/audit-run.js";
import { findFindingsByAuditRun } from "./db/repositories/finding.js";
import { createBaseline, findLatestBaseline, type BaselineSnapshot } from "./db/repositories/baseline.js";
import { createRegressionRecord } from "./db/repositories/regression.js";
import { classifyRegressions } from "./regression/classify.js";
import { openSeomedicDb } from "./db/connection.js";

const server = new McpServer({ name: "seomedic", version: "0.1.0" });

const AUDIT_INPUT = {
  url: z.string().url(),
  site: z.boolean().optional().describe("사이트 전체 크롤 여부(기본 false=단일 URL)"),
  maxPages: z.number().int().positive().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  rateLimit: z.number().positive().optional().describe("초당 요청 수(기본 1)"),
  projectRoot: z.string().optional().describe("생략 시 이 MCP 서버 프로세스의 현재 작업 디렉터리를 사용"),
};

function resolveProjectRoot(projectRoot: string | undefined): string {
  return projectRoot ?? process.cwd();
}

server.registerTool(
  "seomedic_audit",
  {
    title: "SEO/GEO 진단",
    description:
      "URL(또는 사이트)을 크롤+렌더링해 raw/rendered 신호 차이·CWV·규칙 위반을 진단하고 Markdown 리포트를 반환합니다. 분석 전용(소스 미수정).",
    inputSchema: AUDIT_INPUT,
  },
  async ({ url, site, maxPages, maxDepth, rateLimit, projectRoot }) => {
    const result = await runAudit({
      url,
      projectRoot: resolveProjectRoot(projectRoot),
      siteMode: site ?? false,
      maxPages,
      maxDepth,
      requestsPerSecond: rateLimit,
    });
    try {
      const markdown = buildMarkdownReport(result.reportInput);
      const notes: string[] = [];
      if (result.skippedByRobots.length > 0) notes.push(`robots.txt로 차단되어 건너뛴 URL ${result.skippedByRobots.length}개`);
      if (result.truncated) notes.push("max-pages 상한에 도달해 크롤이 잘렸습니다");
      const footer = notes.length > 0 ? `\n\n> 참고: ${notes.join(" · ")}` : "";
      return { content: [{ type: "text" as const, text: markdown + footer }] };
    } finally {
      result.db.close();
    }
  },
);

server.registerTool(
  "seomedic_save_baseline",
  {
    title: "베이스라인 저장",
    description:
      "가장 최근에 실행한 seomedic_audit 결과를 회귀 비교 기준(베이스라인)으로 저장합니다. 새로 진단을 다시 돌리지 않고, 이미 있는 최근 감사 결과를 그대로 기준점으로 삼습니다. 사용자가 명시적으로 요청했을 때만 호출하세요(자동 저장 금지).",
    inputSchema: { url: z.string().url(), projectRoot: z.string().optional() },
  },
  async ({ url, projectRoot }) => {
    // 새 audit을 다시 도는 게 아니라, 이미 저장된 "가장 최근 audit" 결과를 그대로 스냅샷한다.
    // PRD 시나리오(C): 베이스라인은 "첫 audit 시" 그 결과를 기준으로 저장하는 것이지,
    // 별도로 크롤+렌더+Lighthouse를 다시 도는 게 아니다(재감사는 seomedic_check의 역할).
    const db = openSeomedicDb(resolveProjectRoot(projectRoot));
    try {
      const project = findOrCreateProject(db, { target: url, mode: "analyze", sourceAvailable: false });
      const latestRun = findLatestAuditRunByProject(db, project.id);
      if (!latestRun) {
        return {
          content: [
            { type: "text" as const, text: "먼저 `seomedic_audit`을 실행해 진단 결과를 만든 뒤 베이스라인을 저장해주세요." },
          ],
        };
      }
      const findings = findFindingsByAuditRun(db, latestRun.id);
      const baseline = createBaseline(db, project.id, findings, "user_ack");
      return {
        content: [
          {
            type: "text" as const,
            text: `가장 최근 진단(audit id=${latestRun.id}) 결과를 베이스라인으로 저장했습니다(id=${baseline.id}, 위반 ${findings.length}건 기준). 다음부터 \`seomedic_check\`로 이 시점 대비 원복을 확인할 수 있습니다.`,
          },
        ],
      };
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "seomedic_check",
  {
    title: "회귀(원복) 확인",
    description: "저장된 베이스라인 대비 원복(regression)을 확인합니다. 베이스라인이 없으면 먼저 seomedic_save_baseline이 필요합니다.",
    inputSchema: { url: z.string().url(), projectRoot: z.string().optional() },
  },
  async ({ url, projectRoot }) => {
    const root = resolveProjectRoot(projectRoot);
    const db = openSeomedicDb(root);
    try {
      const project = findOrCreateProject(db, { target: url, mode: "analyze", sourceAvailable: false });
      const baseline = findLatestBaseline(db, project.id);
      if (!baseline) {
        return {
          content: [
            {
              type: "text" as const,
              text: "베이스라인이 없습니다. 먼저 `seomedic_save_baseline`을 호출해 현재 상태를 기준으로 저장해주세요.",
            },
          ],
        };
      }

      // 이미 연 db를 그대로 넘겨 재사용한다(같은 파일에 커넥션 중복 오픈 방지).
      const result = await runAudit({ url, projectRoot: root, siteMode: false, db });
      const snapshot: BaselineSnapshot = JSON.parse(baseline.snapshot);
      const { revertedKeys, classification } = classifyRegressions(result.findings, snapshot);
      createRegressionRecord(db, project.id, baseline.id, revertedKeys, classification);

      if (revertedKeys.length === 0) {
        return { content: [{ type: "text" as const, text: "베이스라인 대비 원복된 항목이 없습니다." }] };
      }

      const regressionKeys = revertedKeys.filter((k) => classification[k] === "regression");
      const intendedKeys = revertedKeys.filter((k) => classification[k] === "intended");
      const findingsByKey = new Map(result.findings.map((f) => [f.finding_key, f]));

      const lines = ["## 회귀 확인 결과", ""];
      if (regressionKeys.length > 0) {
        lines.push(`### ⚠️ 원복 의심 (${regressionKeys.length}건)`);
        for (const key of regressionKeys) {
          const f = findingsByKey.get(key);
          if (f) lines.push(`- \`${f.rule_id}\` — ${f.page_url} (${f.severity})`);
        }
      }
      if (intendedKeys.length > 0) {
        lines.push(`### 의도된 변경으로 표시됨 (${intendedKeys.length}건, 재알림 없음)`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } finally {
      db.close();
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[seomedic-mcp] 치명적 오류:", err);
  process.exit(1);
});
