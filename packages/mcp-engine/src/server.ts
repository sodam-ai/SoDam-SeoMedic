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
import { planLocalFix, FixPlanBlockedError } from "./fix-orchestrator/plan.js";
import { applyLocalFixes, FixApplyBlockedError } from "./fix-orchestrator/apply.js";
import { rollbackLocalFix, FixRollbackError } from "./fix-orchestrator/rollback.js";
import { setApprovalStatus } from "./db/repositories/fix.js";
import { runGithubFix, GithubFixBlockedError, type GithubFixBucketResult } from "./github/orchestrator.js";
import { createOctokitGithubClient } from "./github/api-client.js";
import { getGithubToken, GithubTokenError } from "./github/token.js";
import { parseRepoUrl, InvalidRepoUrlError } from "./github/types.js";

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
      // "robots.txt로 차단"이라고 단정하지 않는다 — robots.txt 조회 자체가 네트워크 오류로 실패해도
      // 안전을 위해 동일하게 크롤을 건너뛰므로(fail-closed), 실제 원인이 "명시적 차단"인지
      // "사이트 접속 실패(오타·다운 등)"인지 이 시점엔 구분할 수 없다(추측 금지).
      if (result.skippedByRobots.length > 0)
        notes.push(
          `robots.txt 정책 또는 사이트 접속 실패로 건너뛴 URL ${result.skippedByRobots.length}개 — URL이 정확한지, 사이트가 접속 가능한지 확인해주세요`,
        );
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

// fix 툴은 실제로 파일을 쓸 수 있으므로(analyze 툴과 달리) projectRoot를 생략 허용하지 않는다 —
// MCP 서버 프로세스의 cwd에 암묵적으로 의존하는 건 읽기 전용 진단에는 괜찮아도 쓰기 작업엔 안전하지 않다.
const FIX_PROJECT_ROOT_INPUT = { projectRoot: z.string().describe("로컬 Next.js 프로젝트 폴더의 절대 경로") };

server.registerTool(
  "seomedic_fix_plan",
  {
    title: "수정 계획 생성(dry-run)",
    description:
      "로컬 Next.js 프로젝트를 대상으로 로컬 서버를 기동해 진단하고, '없는 것 추가'(add_safe)는 자동 계획, 색인·표시에 영향을 주는 변경(gated)은 승인 대기로 계획만 만듭니다(파일 미수정, dry-run). git 상태가 clean이 아니면 거부합니다.",
    inputSchema: FIX_PROJECT_ROOT_INPUT,
  },
  async ({ projectRoot }) => {
    const db = openSeomedicDb(projectRoot);
    try {
      const result = await planLocalFix(db, projectRoot);
      const lines: string[] = [`## 수정 계획 (audit_run_id=${result.auditRunId})`];
      if (result.truncated) lines.push("> 참고: max-pages 상한에 도달해 크롤이 잘렸습니다.");

      if (result.plannedFixes.length > 0) {
        lines.push("", "### 적용 가능한 수정");
        for (const { fix, finding } of result.plannedFixes) {
          lines.push(`- fix id=${fix.id} · ${finding.rule_id} · ${fix.risk_level}(${fix.approval_status}) · ${fix.target_path}`);
          lines.push("```diff", fix.dry_run_diff, "```");
          if (fix.approval_status === "pending") {
            lines.push(`  → 승인 필요: \`seomedic_fix_approve\`(fixId=${fix.id}) 또는 \`seomedic_fix_reject\`(fixId=${fix.id})`);
          }
        }
      }
      if (result.reportOnlyFindings.length > 0) {
        lines.push("", `### 자동 수정 불가(제안만, ${result.reportOnlyFindings.length}건)`);
        for (const f of result.reportOnlyFindings) lines.push(`- ${f.rule_id} · ${f.page_url} (${f.severity})`);
      }
      if (result.plannedFixes.length === 0 && result.reportOnlyFindings.length === 0) {
        lines.push("", "발견된 문제가 없습니다.");
      } else {
        lines.push(
          "",
          `적용하려면 \`seomedic_fix_apply\`(auditRunId=${result.auditRunId})를 호출하세요(auto이거나 승인된 것만 실제로 파일에 반영됩니다). add_safe 수정도 실제 파일 변경이니 커밋·배포 전에 diff를 검토하세요.`,
        );
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      if (err instanceof FixPlanBlockedError) {
        return { content: [{ type: "text" as const, text: `수정 계획을 만들 수 없습니다: ${err.message}` }] };
      }
      throw err;
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "seomedic_fix_approve",
  {
    title: "gated 수정 승인",
    description: "seomedic_fix_plan이 만든 gated(승인 대기) fix를 승인합니다. pending 상태가 아니면(이미 처리됨) 변경되지 않습니다.",
    inputSchema: { ...FIX_PROJECT_ROOT_INPUT, fixId: z.number().int().positive() },
  },
  async ({ projectRoot, fixId }) => {
    const db = openSeomedicDb(projectRoot);
    try {
      const result = setApprovalStatus(db, fixId, "approved");
      if (!result.changed) {
        return {
          content: [
            { type: "text" as const, text: `fix id=${fixId}는 이미 처리되었거나 존재하지 않습니다(현재 상태: ${result.fix?.approval_status ?? "없음"}).` },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: `fix id=${fixId} 승인 완료. \`seomedic_fix_apply\`로 적용하세요.` }] };
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "seomedic_fix_reject",
  {
    title: "gated 수정 거부",
    description: "seomedic_fix_plan이 만든 gated(승인 대기) fix를 거부합니다(적용되지 않음). pending 상태가 아니면 변경되지 않습니다.",
    inputSchema: { ...FIX_PROJECT_ROOT_INPUT, fixId: z.number().int().positive() },
  },
  async ({ projectRoot, fixId }) => {
    const db = openSeomedicDb(projectRoot);
    try {
      const result = setApprovalStatus(db, fixId, "rejected");
      if (!result.changed) {
        return {
          content: [
            { type: "text" as const, text: `fix id=${fixId}는 이미 처리되었거나 존재하지 않습니다(현재 상태: ${result.fix?.approval_status ?? "없음"}).` },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: `fix id=${fixId} 거부됨(적용되지 않습니다).` }] };
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "seomedic_fix_apply",
  {
    title: "수정 적용",
    description:
      "seomedic_fix_plan에서 auto(add_safe) 또는 승인된 fix를 실제 파일에 반영합니다. 적용 후 `next build`로 재검증하고, 실패하면 그 fix만 자동으로 롤백합니다. git 상태가 clean이 아니면 거부합니다.",
    inputSchema: { ...FIX_PROJECT_ROOT_INPUT, auditRunId: z.number().int().positive().describe("seomedic_fix_plan이 반환한 audit_run_id") },
  },
  async ({ projectRoot, auditRunId }) => {
    const db = openSeomedicDb(projectRoot);
    try {
      const outcomes = await applyLocalFixes(db, projectRoot, auditRunId);
      if (outcomes.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "적용할 fix가 없습니다(전부 이미 적용됐거나 gated 승인 대기 중일 수 있습니다)." },
          ],
        };
      }
      const lines = ["## 적용 결과"];
      for (const o of outcomes) lines.push(`- fix id=${o.fixId} (${o.targetPath ?? "-"}): ${o.outcome} — ${o.detail}`);
      lines.push("", "⚠️ add_safe 수정도 실제 파일 변경입니다 — 커밋·배포 전에 diff를 검토하세요(safe 수정이니 무해하다고 가정하지 마세요).");
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      if (err instanceof FixApplyBlockedError) {
        return { content: [{ type: "text" as const, text: `적용할 수 없습니다: ${err.message}` }] };
      }
      throw err;
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "seomedic_fix_rollback",
  {
    title: "적용된 수정 되돌리기",
    description: "이미 적용된 fix를 apply 시점의 백업 파일로 되돌립니다.",
    inputSchema: { ...FIX_PROJECT_ROOT_INPUT, fixId: z.number().int().positive() },
  },
  async ({ projectRoot, fixId }) => {
    const db = openSeomedicDb(projectRoot);
    try {
      const result = await rollbackLocalFix(db, projectRoot, fixId);
      return { content: [{ type: "text" as const, text: `fix id=${fixId} (${result.targetPath})을 되돌렸습니다.` }] };
    } catch (err) {
      if (err instanceof FixRollbackError) {
        return { content: [{ type: "text" as const, text: `되돌릴 수 없습니다: ${err.message}` }] };
      }
      throw err;
    } finally {
      db.close();
    }
  },
);

/** safe/review 두 bucket을 같은 형식으로 렌더링한다(2026-08-20, 위험도별 PR 분리 재설계). */
function renderGithubFixBucket(label: string, bucket: GithubFixBucketResult): string[] {
  const lines: string[] = [`### ${label} — ${bucket.branchName}`];

  if (bucket.duplicateSkipped) {
    lines.push("이미 같은 브랜치로 열린 PR이 있어 건너뛰었습니다(중복 방지).");
    return lines;
  }
  if (bucket.pr) {
    lines.push(
      `- PR: ${bucket.pr.url}`,
      "⚠️ main 브랜치에 직접 반영되지 않았고 자동 머지되지도 않았습니다 — 저장소 관리자가 diff를 검토한 뒤 직접 병합해야 합니다.",
    );
    return lines;
  }
  if (bucket.autoFixes.length === 0 && bucket.gatedFixes.length === 0) {
    lines.push("이 위험도에 해당하는 수정이 없습니다.");
    return lines;
  }
  lines.push("적용에 실패했습니다:", ...bucket.applied.map((a) => `- ${a.targetPath ?? "-"}: ${a.outcome} — ${a.detail}`));
  return lines;
}

server.registerTool(
  "seomedic_fix_github",
  {
    title: "GitHub 저장소 자동 수정(PR 제안) — 부분 검증",
    description:
      "GitHub 저장소를 대상으로 수정 사항을 브랜치에 반영해 PR을 생성합니다(제안, main 직접 push·자동 머지 없음 — PR 자체가 승인 절차이며, 병합 여부는 저장소 관리자가 직접 결정합니다). 위험도별로 PR을 2개까지 분리해서 만듭니다 — 무해한 추가(add_safe)만 담은 PR과, 색인·표시에 영향을 주는(gated, canonical·OG·noindex·robots.ts 등) 항목만 담은 PR을 따로 열어, 저장소 관리자가 안전한 것부터 바로 검토하고 중요한 것은 diff를 더 신중히 볼 수 있게 합니다(2026-08-20). 본인 소유 저장소는 실제 GitHub에서 PR 생성까지 검증 완료(2026-07-04). fork(남의 저장소) 경로는 fork 생성·복제까지 실제 GitHub로 검증됐으나 ⚠️ 마지막 PR 생성 단계는 아직 미검증입니다. SEOMEDIC_GITHUB_TOKEN 환경변수가 필요합니다.",
    inputSchema: {
      repoUrl: z.string().describe("GitHub 저장소 주소(예: https://github.com/owner/repo 또는 owner/repo)"),
      maxRepoSizeKb: z.number().int().positive().optional().describe("clone 허용 최대 저장소 크기(KB), 기본 500MB"),
    },
  },
  async ({ repoUrl, maxRepoSizeKb }) => {
    try {
      const ref = parseRepoUrl(repoUrl);
      const token = getGithubToken();
      const client = createOctokitGithubClient(token);
      const result = await runGithubFix(client, ref, { maxRepoSizeKb });

      const lines: string[] = [`## GitHub 수정 결과 — ${ref.owner}/${ref.repo}`];
      if (result.policyWarnings.length > 0) {
        lines.push("", "### 경고", ...result.policyWarnings.map((w) => `- ${w}`));
      }

      lines.push("", ...renderGithubFixBucket("무해한 추가(add_safe)", result.safe));
      lines.push("", ...renderGithubFixBucket("승인 필요(gated — 색인·표시 영향)", result.review));

      const totalReportOnly = result.safe.reportOnlyFindings.length; // safe/review 두 bucket이 각자
      // 전체 규칙을 다시 평가하므로 report-only 목록은 사실상 동일한 집합이다(같은 clone 상태를
      // 대상으로 함) — 중복 표시를 피하려 한쪽(safe)만 대표로 쓴다.
      if (totalReportOnly > 0) {
        lines.push("", `### 자동 수정 불가(제안만, ${totalReportOnly}건)`);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      if (err instanceof InvalidRepoUrlError || err instanceof GithubTokenError || err instanceof GithubFixBlockedError) {
        return { content: [{ type: "text" as const, text: `GitHub 수정을 진행할 수 없습니다: ${err.message}` }] };
      }
      throw err;
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
