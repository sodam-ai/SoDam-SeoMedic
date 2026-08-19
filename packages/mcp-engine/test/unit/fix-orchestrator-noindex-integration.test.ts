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
 * node_modules 통째 복사 + 독립 git repo) — 공유 test/fixtures/nextjs-minimal/ 원본은 절대 건드리지
 * 않는다. 홈페이지에 canonical·robots.index:false를 심어 R-NOINDEX-DETECTED 1건만 깔끔하게 발생시킨다
 * (canonical을 미리 채워 R-CANONICAL-MISSING이 같이 발생해 노이즈가 섞이는 걸 방지).
 */
function makeIsolatedNoindexProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-noindex-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n  alternates: {\n    canonical: "/",\n  },\n  robots: {\n    index: false,\n  },\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-NOINDEX-DETECTED gated fixer(승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedNoindexProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const noindexFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-NOINDEX-DETECTED");
      expect(noindexFix).toBeDefined();
      expect(noindexFix!.fix.risk_level).toBe("gated");
      expect(noindexFix!.fix.approval_status).toBe("pending");
      expect(noindexFix!.fix.applied_at).toBeNull();

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const before = fs.readFileSync(pagePath, "utf-8");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

      expect(fs.readFileSync(pagePath, "utf-8")).toBe(before); // 승인 없이는 여전히 index: false 그대로

      const stillPending = findFixesByFinding(db, noindexFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → index:true로 교정 → rollback으로 false 원복", async () => {
    const projectRoot = makeIsolatedNoindexProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const noindexFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-NOINDEX-DETECTED");
      expect(noindexFix).toBeDefined();
      const { fix, finding } = noindexFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const noindexOutcome = outcomes.find((o) => o.fixId === fix.id);
      expect(noindexOutcome).toBeDefined();
      expect(noindexOutcome!.outcome).toBe("applied");

      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain("index: true");
      expect(content).not.toContain("index: false");

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull(); // 기존 파일 수정이라 백업이 있어야 정상(신규생성 fixer와 다른 지점)

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(pagePath, "utf-8")).toContain("index: false"); // 되돌리기=원래 noindex 상태로 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedNoindexProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const noindexFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-NOINDEX-DETECTED");
      expect(noindexFix).toBeDefined();
      const { fix, finding } = noindexFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const before = fs.readFileSync(pagePath, "utf-8");

      const rejection = setApprovalStatus(db, fix.id, "rejected");
      expect(rejection.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === fix.id)).toBe(false);

      expect(fs.readFileSync(pagePath, "utf-8")).toBe(before);

      const stillRejected = findFixesByFinding(db, finding.id)[0];
      expect(stillRejected.approval_status).toBe("rejected");
      expect(stillRejected.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(d) 재실행(re-plan)해도 이미 index:true로 고쳐진 페이지는 또 다른 fix로 잡히지 않는다(멱등)", async () => {
    const projectRoot = makeIsolatedNoindexProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-NOINDEX-DETECTED");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      // 적용 후 남은 변경사항(page.tsx 수정)을 커밋해 git-clean 상태를 다시 만든다(재실행 전제조건).
      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply noindex fix"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-NOINDEX-DETECTED");
      expect(secondFix).toBeUndefined(); // 이미 index:true라 새 fix를 또 만들지 않는다

      const stillFlagged = secondPlan.findings.find((f) => f.rule_id === "R-NOINDEX-DETECTED");
      expect(stillFlagged).toBeUndefined(); // 렌더된 페이지도 더 이상 noindex가 아니므로 규칙 자체가 발생하지 않아야 한다
    } finally {
      db.close();
    }
  }, 300_000);
});
