import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { openSeomedicDb } from "../../src/db/connection.js";
import { planLocalFix } from "../../src/fix-orchestrator/plan.js";
import { applyLocalFixes } from "../../src/fix-orchestrator/apply.js";
import { rollbackLocalFix } from "../../src/fix-orchestrator/rollback.js";
import { findFixesByFinding, setApprovalStatus } from "../../src/db/repositories/fix.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/nextjs-minimal");

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/**
 * fix-orchestrator-og-integration.test.ts의 makeIsolatedOgProject와 동일한 격리 방식(별도 임시 폴더 +
 * node_modules 통째 복사 + 독립 git repo). 공유 fixtures/nextjs-minimal/ 원본은 app/robots.ts가 없으므로
 * (실제 파일 목록으로 확인됨) 별도 조작 없이 그대로 복사만 해도 R-AI-CRAWLER-POLICY가 "robots.txt 없음"
 * 상태로 자연히 발생한다.
 */
function makeIsolatedRobotsProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-robots-ai-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-AI-CRAWLER-POLICY gated fixer(신규 파일 생성·승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 파일을 만들지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedRobotsProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const robotsFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-AI-CRAWLER-POLICY");
      expect(robotsFix).toBeDefined();
      expect(robotsFix!.fix.risk_level).toBe("gated");
      expect(robotsFix!.fix.approval_status).toBe("pending");
      expect(robotsFix!.fix.applied_at).toBeNull();
      expect(robotsFix!.fix.target_path).toBe(path.join("app", "robots.ts"));

      const robotsPath = path.join(projectRoot, "app", "robots.ts");
      expect(fs.existsSync(robotsPath)).toBe(false);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

      expect(fs.existsSync(robotsPath)).toBe(false); // 승인 없이는 여전히 생성되지 않아야 한다

      const stillPending = findFixesByFinding(db, robotsFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → robots.ts 신규 생성 → rollback으로 삭제 원복", async () => {
    const projectRoot = makeIsolatedRobotsProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const robotsFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-AI-CRAWLER-POLICY");
      expect(robotsFix).toBeDefined();
      const { fix, finding } = robotsFix!;

      const robotsPath = path.join(projectRoot, "app", "robots.ts");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const robotsOutcome = outcomes.find((o) => o.fixId === fix.id);
      expect(robotsOutcome).toBeDefined();
      expect(robotsOutcome!.outcome).toBe("applied");

      expect(fs.existsSync(robotsPath)).toBe(true);
      const content = fs.readFileSync(robotsPath, "utf-8");
      expect(content).toContain("GPTBot");
      expect(content).toContain('userAgent: "*", allow: "/"');

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      // 신규 생성이라 백업할 원본이 없다(git-guard.ts backupFiles의 "신규 파일은 스킵" 분기 — 의도된 null).
      expect(appliedFix.backup_path).toBeNull();

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.existsSync(robotsPath)).toBe(false); // 되돌리기=우리가 만든 파일을 삭제
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 파일을 만들지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedRobotsProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const robotsFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-AI-CRAWLER-POLICY");
      expect(robotsFix).toBeDefined();
      const { fix, finding } = robotsFix!;

      const robotsPath = path.join(projectRoot, "app", "robots.ts");

      const rejection = setApprovalStatus(db, fix.id, "rejected");
      expect(rejection.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === fix.id)).toBe(false);

      expect(fs.existsSync(robotsPath)).toBe(false);

      const stillRejected = findFixesByFinding(db, finding.id)[0];
      expect(stillRejected.approval_status).toBe("rejected");
      expect(stillRejected.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(d) 재실행(re-plan)해도 이미 생성된 robots.ts는 또 다른 fix로 잡히지 않는다(멱등)", async () => {
    const projectRoot = makeIsolatedRobotsProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-AI-CRAWLER-POLICY");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      // 적용 후 남은 변경사항(robots.ts 신규 파일)을 커밋해 git-clean 상태를 다시 만든다(재실행 전제조건).
      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply robots.ts"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-AI-CRAWLER-POLICY");
      expect(secondFix).toBeUndefined(); // 이미 파일이 있으니(마커 포함) 새 fix를 또 만들지 않는다

      const reportOnly = secondPlan.reportOnlyFindings.find((f) => f.rule_id === "R-AI-CRAWLER-POLICY");
      expect(reportOnly).toBeDefined(); // finding 자체는 계속 정보성으로 보고됨(중립 리포트 원칙)
    } finally {
      db.close();
    }
  }, 300_000);
});
