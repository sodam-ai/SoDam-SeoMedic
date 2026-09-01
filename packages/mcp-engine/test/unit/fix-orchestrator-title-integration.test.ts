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
 * fix-orchestrator-noindex-integration.test.ts의 makeIsolatedNoindexProject와 동일한 격리 방식(별도
 * 임시 폴더 + node_modules 통째 복사 + 독립 git repo) — 공유 test/fixtures/nextjs-minimal/ 원본은
 * 절대 건드리지 않는다. 홈페이지에 title은 의도적으로 비워두고(R-TITLE-MISSING을 발생시키는 조건)
 * canonical·robots.index:true는 미리 채워 R-CANONICAL-MISSING·R-NOINDEX-DETECTED가 같이 발생해
 * 노이즈가 섞이는 걸 방지한다(noindex 테스트와 동일 이유).
 */
function makeIsolatedTitleProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-title-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  alternates: {\n    canonical: "/",\n  },\n  robots: {\n    index: true,\n  },\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

/**
 * makeIsolatedTitleProject와 동일한 격리 방식이지만, app/page.tsx에 metadata export 자체를 아예
 * 두지 않는다(B-1 확장 — "신규 export 삽입" 경로를 실제 next build까지 통과시켜 검증하기 위한
 * 전용 픽스처). 이 상태에선 R-CANONICAL-MISSING 등 다른 gated finding도 함께 발생할 수 있지만,
 * 아래 테스트는 R-TITLE-MISSING 건만 골라 승인·적용하므로 다른 finding은 그대로 pending으로 남아
 * 파일을 건드리지 않는다(기존 테스트들과 동일한 격리 원칙).
 */
function makeIsolatedTitleProjectNoMetadata(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-title-fix-newexport-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 신규 export 테스트</h1>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-TITLE-MISSING gated fixer, metadata export 신규 삽입(B-1 확장, 2026-09-01)", () => {
  it("metadata export가 아예 없는 페이지: 승인 → 적용 → 실제 next build 통과 → 새 export가 title과 함께 삽입됨", async () => {
    const projectRoot = makeIsolatedTitleProjectNoMetadata();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const titleFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(titleFix).toBeDefined();
      const { fix, finding } = titleFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");
      expect(beforeApply).not.toContain("export const metadata"); // 착수 전엔 metadata export 자체가 없어야 정상

      setApprovalStatus(db, fix.id, "approved");
      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const titleOutcome = outcomes.find((o) => o.fixId === fix.id);
      expect(titleOutcome).toBeDefined();
      expect(titleOutcome!.outcome).toBe("applied");

      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain('export const metadata = {\n  title: "SeoMedic 신규 export 테스트",\n};'); // 새 export가 삽입됨
      expect(content).toContain("<h1>SeoMedic 신규 export 테스트</h1>"); // JSX는 손대지 않음

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(pagePath, "utf-8")).not.toContain("export const metadata"); // 되돌리기=원래대로 export 자체가 없는 상태
    } finally {
      db.close();
    }
  }, 240_000);
});

describe("fix-orchestrator 통합 — R-TITLE-MISSING gated fixer(h1 복사·승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedTitleProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const titleFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(titleFix).toBeDefined();
      expect(titleFix!.fix.risk_level).toBe("gated");
      expect(titleFix!.fix.approval_status).toBe("pending");
      expect(titleFix!.fix.applied_at).toBeNull();
      expect(titleFix!.fix.dry_run_diff).toContain("SeoMedic 테스트 픽스처");

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const before = fs.readFileSync(pagePath, "utf-8");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === titleFix!.fix.id)).toBe(false);

      expect(fs.readFileSync(pagePath, "utf-8")).toBe(before); // 승인 없이는 title 필드 자체가 여전히 없음

      const stillPending = findFixesByFinding(db, titleFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → title이 h1 텍스트로 채워짐 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedTitleProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const titleFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(titleFix).toBeDefined();
      const { fix, finding } = titleFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const titleOutcome = outcomes.find((o) => o.fixId === fix.id);
      expect(titleOutcome).toBeDefined();
      expect(titleOutcome!.outcome).toBe("applied");

      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain('title: "SeoMedic 테스트 픽스처"');
      expect(content).toContain("canonical:"); // 기존 필드는 그대로 보존
      expect(content).toContain("<h1>SeoMedic 테스트 픽스처</h1>"); // JSX는 손대지 않음

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull(); // 기존 파일 수정이라 백업이 있어야 정상

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(pagePath, "utf-8")).not.toContain("title:"); // 되돌리기=title 필드가 없던 원래 상태로 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedTitleProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const titleFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(titleFix).toBeDefined();
      const { fix, finding } = titleFix!;

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

  it("(d) 재실행(re-plan)해도 이미 title이 채워진 페이지는 또 다른 fix로 잡히지 않는다(멱등)", async () => {
    const projectRoot = makeIsolatedTitleProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      // 적용 후 남은 변경사항(page.tsx 수정)을 커밋해 git-clean 상태를 다시 만든다(재실행 전제조건).
      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply title fix"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-TITLE-MISSING");
      expect(secondFix).toBeUndefined(); // 이미 title이 있으니 새 fix를 또 만들지 않는다

      const stillFlagged = secondPlan.findings.find((f) => f.rule_id === "R-TITLE-MISSING");
      expect(stillFlagged).toBeUndefined(); // 렌더된 페이지도 더 이상 title 없음이 아니므로 규칙 자체가 발생하지 않아야 한다
    } finally {
      db.close();
    }
  }, 300_000);
});
