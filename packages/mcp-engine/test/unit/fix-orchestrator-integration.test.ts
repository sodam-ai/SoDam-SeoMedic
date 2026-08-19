import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { openSeomedicDb } from "../../src/db/connection.js";
import { planLocalFix, FixPlanBlockedError } from "../../src/fix-orchestrator/plan.js";
import { applyLocalFixes } from "../../src/fix-orchestrator/apply.js";
import { rollbackLocalFix } from "../../src/fix-orchestrator/rollback.js";
import { findFixesByFinding } from "../../src/db/repositories/fix.js";

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
 * 체크인된 픽스처를 직접 수정하면 실제 프로젝트 git 이력이 더러워지므로 전체를 임시 폴더에 복사한다.
 * (실제로 겪은 문제: node_modules를 junction/symlink로 재사용하면 Next.js 16 Turbopack이
 * "Symlink ... points out of the filesystem root"로 빌드를 거부한다 — 임시폴더(C:)와 픽스처(D:)가
 * 다른 드라이브라 발생. 그래서 시간이 더 걸리더라도 node_modules까지 통째로 복사한다.)
 * 복사한 임시 폴더 안에 별도의 독립 git repo를 만들어 git-clean 전제를 충족시킨다.
 */
function makeIsolatedNextProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  // .next(빌드 산출물)·.seomedic(DB)가 untracked 상태로 남으면 build/plan 이후 checkGitClean이
  // "dirty"로 오판해 apply가 막힌다(실제로 겪을 뻔한 문제) — 커밋 전에 반드시 gitignore 처리.
  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  // sitemap에 없는 /about 페이지를 새로 추가하고, 홈페이지에 링크를 걸어 크롤 BFS가 실제로 발견하게 한다.
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

describe("fix-orchestrator 통합 — 실제 Next.js 빌드+git", () => {
  it("plan → apply → rollback 전체 흐름이 실제로 파일을 반영하고 되돌린다", async () => {
    const projectRoot = makeIsolatedNextProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      // 2026-08-19: robots.ts가 없는 이 픽스처는 R-AI-CRAWLER-POLICY(gated) fixer도 함께 트리거하므로
      // (fixers/robots-ai-policy-fixer.ts) 더 이상 sitemap 1건만 있다고 단정할 수 없다 — rule_id로
      // 특정해 찾는다(fix-orchestrator-og-integration.test.ts 등 다른 통합 테스트와 동일 패턴).
      const sitemapFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-SITEMAP-MISSING-URL");
      expect(sitemapFix).toBeDefined();
      const { fix, finding } = sitemapFix!;
      expect(finding.rule_id).toBe("R-SITEMAP-MISSING-URL");
      expect(fix.risk_level).toBe("add_safe");
      expect(fix.approval_status).toBe("auto");
      expect(fix.dry_run_diff).toContain("https://example.com/about");
      expect(fix.applied_at).toBeNull();

      const sitemapPath = path.join(projectRoot, "app", "sitemap.ts");
      const beforeApply = fs.readFileSync(sitemapPath, "utf-8");
      expect(beforeApply).not.toContain("/about");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe("applied");

      const afterApply = fs.readFileSync(sitemapPath, "utf-8");
      expect(afterApply).toContain("https://example.com/about");

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();
      expect(fs.existsSync(appliedFix.backup_path!)).toBe(true);

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      const afterRollback = fs.readFileSync(sitemapPath, "utf-8");
      expect(afterRollback).toBe(beforeApply); // 원본과 완전히 동일하게 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("apply 2회 실행해도 중복 삽입 없음(멱등)", async () => {
    const projectRoot = makeIsolatedNextProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      await applyLocalFixes(db, projectRoot, planResult.auditRunId);

      // 같은 auditRunId로 apply를 다시 호출 — 이미 applied_at이 찍혀 findApplicableFixesByAuditRun에서
      // 제외되므로 outcomes가 비어야 한다(재적용 시도 자체가 없음 = 중복 삽입 물리적으로 불가능).
      const secondOutcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(secondOutcomes).toHaveLength(0);

      const sitemapPath = path.join(projectRoot, "app", "sitemap.ts");
      const content = fs.readFileSync(sitemapPath, "utf-8");
      const occurrences = content.split("/about").length - 1;
      expect(occurrences).toBe(1); // 두 번 적용해도 한 번만 들어있음
    } finally {
      db.close();
    }
  }, 240_000);

  it("git이 dirty면 plan 자체를 거부한다(백업 없이 진행 금지)", async () => {
    const projectRoot = makeIsolatedNextProject();
    fs.writeFileSync(path.join(projectRoot, "README.md"), "dirty change"); // 추적 안 된 새 파일 = dirty
    const db = openSeomedicDb(projectRoot);

    try {
      await expect(planLocalFix(db, projectRoot)).rejects.toThrow(FixPlanBlockedError);
    } finally {
      db.close();
    }
  }, 120_000); // makeIsolatedNextProject()의 node_modules 전체 복사가 Windows CI에서 30s를 넘길 수 있음(2026-08-09 실측 35~40s, 다른 테스트와 동일한 120s 여유)
});
