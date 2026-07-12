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
 * fix-orchestrator-integration.test.ts와 동일한 격리 방식(별도 임시 폴더 + node_modules 통째 복사 +
 * 독립 git repo)이지만, 홈페이지를 canonical 전용 시나리오로 덮어쓴다는 점이 다르다 — 공유
 * test/fixtures/nextjs-minimal/의 원본 파일은 절대 건드리지 않는다(다른 테스트가 그 "빈 컴포넌트"
 * 형태에 의존하므로, 이 헬퍼는 항상 복사본 위에서만 동작한다).
 *
 * 홈페이지에 정적 metadata(title만, alternates 없음)를 심어 R-CANONICAL-MISSING 1건만 깔끔하게
 * 발생시킨다. 다른 페이지·링크를 추가하지 않아 크롤이 홈 하나만 발견하고, sitemap.ts에는 이미
 * 루트 URL("https://example.com/")이 있어 R-SITEMAP-MISSING-URL은 발생하지 않는다 — 두 fixer가
 * 서로 간섭하지 않게 의도적으로 분리한 설계.
 */
function makeIsolatedCanonicalProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-canonical-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — canonical gated fixer(승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedCanonicalProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      // R-OG-BASIC-MISSING도 함께 발생할 수 있다(픽스처는 title만 있고 og:title 태그는 없음) —
      // 이 테스트의 관심사는 canonical fixer뿐이므로 rule_id로 명시적으로 특정한다(index 의존 금지).
      const canonicalPlanned = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-CANONICAL-MISSING");
      expect(canonicalPlanned).toBeDefined();
      const { fix, finding } = canonicalPlanned!;
      expect(fix.risk_level).toBe("gated");
      expect(fix.approval_status).toBe("pending");
      expect(fix.applied_at).toBeNull();

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");
      expect(beforeApply).not.toContain("alternates");

      // pending 상태 그대로 apply를 호출 — findApplicableFixesByAuditRun은 auto/approved만 조회하므로
      // pending인 이 fix는 애초에 적용 대상 목록에 조회조차 되지 않는다(승인 게이트).
      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      expect(afterApply).toBe(beforeApply); // 파일 완전히 무변경

      const stillPending = findFixesByFinding(db, finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 build 통과 → 파일에 상대경로 canonical 반영 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedCanonicalProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const canonicalPlanned = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-CANONICAL-MISSING");
      expect(canonicalPlanned).toBeDefined();
      const { fix, finding } = canonicalPlanned!;
      expect(fix.risk_level).toBe("gated");

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);
      expect(approval.fix?.approval_status).toBe("approved");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe("applied");

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      // 루트 페이지("/") → 상대경로 "/". 절대 URL이나 로컬 브릿지/placeholder origin이 아니어야 한다.
      expect(afterApply).toContain('alternates: { canonical: "/" }');
      expect(afterApply).not.toContain("local.seomedic.internal");
      expect(afterApply).not.toMatch(/http:\/\//);

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();
      expect(fs.existsSync(appliedFix.backup_path!)).toBe(true);

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      const afterRollback = fs.readFileSync(pagePath, "utf-8");
      expect(afterRollback).toBe(beforeApply); // 원본과 완전히 동일하게 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedCanonicalProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const canonicalPlanned = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-CANONICAL-MISSING");
      expect(canonicalPlanned).toBeDefined();
      const { fix, finding } = canonicalPlanned!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeReject = fs.readFileSync(pagePath, "utf-8");

      const rejection = setApprovalStatus(db, fix.id, "rejected");
      expect(rejection.changed).toBe(true);
      expect(rejection.fix?.approval_status).toBe("rejected");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

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
