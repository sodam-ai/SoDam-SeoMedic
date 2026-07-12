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
 * fix-orchestrator-canonical-integration.test.ts의 makeIsolatedCanonicalProject와 동일한 격리
 * 방식(별도 임시 폴더 + node_modules 통째 복사 + 독립 git repo) — 공유 test/fixtures/nextjs-minimal/
 * 원본은 절대 건드리지 않는다. 홈페이지에 title과 alternates.canonical을 둘 다 심어 R-CANONICAL-MISSING이
 * 발생하지 않게 하고(og:url이 복사할 소스를 갖도록), openGraph는 비워둬 R-OG-BASIC-MISSING 1건만
 * 깔끔하게 발생시킨다.
 */
function makeIsolatedOgProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-og-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n  alternates: {\n    canonical: "/",\n  },\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-OG-BASIC-MISSING gated fixer(승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedOgProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const ogFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-OG-BASIC-MISSING");
      expect(ogFix).toBeDefined();
      expect(ogFix!.fix.risk_level).toBe("gated");
      expect(ogFix!.fix.approval_status).toBe("pending");
      expect(ogFix!.fix.applied_at).toBeNull();
      // canonical은 이미 있으므로 R-CANONICAL-MISSING은 발생하지 않아야 한다(픽스처 설계 의도).
      expect(planResult.plannedFixes.some((p) => p.finding.rule_id === "R-CANONICAL-MISSING")).toBe(false);

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");
      expect(beforeApply).not.toContain("openGraph");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      expect(afterApply).toBe(beforeApply);

      const stillPending = findFixesByFinding(db, ogFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → 파일에 openGraph.title·url 반영 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedOgProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const ogFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-OG-BASIC-MISSING");
      expect(ogFix).toBeDefined();
      const { fix, finding } = ogFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const ogOutcome = outcomes.find((o) => o.fixId === fix.id);
      expect(ogOutcome).toBeDefined();
      expect(ogOutcome!.outcome).toBe("applied");

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      expect(afterApply).toContain('openGraph: { title: "SeoMedic 테스트 픽스처", url: "/" }');

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();
      expect(fs.existsSync(appliedFix.backup_path!)).toBe(true);

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      const afterRollback = fs.readFileSync(pagePath, "utf-8");
      expect(afterRollback).toBe(beforeApply);
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedOgProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const ogFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-OG-BASIC-MISSING");
      expect(ogFix).toBeDefined();
      const { fix, finding } = ogFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeReject = fs.readFileSync(pagePath, "utf-8");

      const rejection = setApprovalStatus(db, fix.id, "rejected");
      expect(rejection.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === fix.id)).toBe(false);

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      expect(afterApply).toBe(beforeReject);

      const stillRejected = findFixesByFinding(db, finding.id)[0];
      expect(stillRejected.approval_status).toBe("rejected");
      expect(stillRejected.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);
});
