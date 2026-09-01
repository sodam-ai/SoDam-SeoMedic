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
 * fix-orchestrator-title-integration.test.ts의 makeIsolatedTitleProject와 동일한 격리 방식 —
 * 별도 임시 폴더 + node_modules 통째 복사 + 독립 git repo, 공유 test/fixtures/nextjs-minimal/
 * 원본은 절대 건드리지 않는다. title·canonical·robots.index는 미리 채워 다른 규칙(R-TITLE-MISSING·
 * R-CANONICAL-MISSING 등)이 같이 발생해 노이즈가 섞이는 걸 방지한다. 홈페이지는 <main> 태그로
 * 감싼 h1 + 문단을 둬서 R-META-DESCRIPTION-MISSING을 발생시키면서 mainFirstParagraphText도
 * 채워지게 한다(둘 다 없으면 report_only로 빠져 이 fixer 자체를 테스트할 수 없음).
 */
function makeIsolatedMetaDescriptionProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-meta-desc-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n  alternates: {\n    canonical: "/",\n  },\n  robots: {\n    index: true,\n  },\n};\n\nexport default function HomePage() {\n  return (\n    <main>\n      <h1>SeoMedic 테스트 픽스처</h1>\n      <p>이것은 검색결과 스니펫으로 쓰일 만한 실제 본문 첫 문단입니다.</p>\n    </main>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-META-DESCRIPTION-MISSING gated fixer(<main> 첫 문단 복사·승인 경로 실증, B-2 2026-09-01)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedMetaDescriptionProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const descFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(descFix).toBeDefined();
      expect(descFix!.fix.risk_level).toBe("gated");
      expect(descFix!.fix.approval_status).toBe("pending");
      expect(descFix!.fix.applied_at).toBeNull();

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const before = fs.readFileSync(pagePath, "utf-8");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === descFix!.fix.id)).toBe(false);
      expect(fs.readFileSync(pagePath, "utf-8")).toBe(before);

      const stillPending = findFixesByFinding(db, descFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → description이 <main> 첫 문단으로 채워짐 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedMetaDescriptionProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const descFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(descFix).toBeDefined();
      const { fix, finding } = descFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");

      setApprovalStatus(db, fix.id, "approved");
      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const outcome = outcomes.find((o) => o.fixId === fix.id);
      expect(outcome).toBeDefined();
      expect(outcome!.outcome).toBe("applied");

      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain('description: "이것은 검색결과 스니펫으로 쓰일 만한 실제 본문 첫 문단입니다."');
      expect(content).toContain('title: "SeoMedic 테스트 픽스처"'); // 기존 필드 보존
      expect(content).toContain("<p>이것은 검색결과 스니펫으로 쓰일 만한 실제 본문 첫 문단입니다.</p>"); // JSX는 손대지 않음

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(pagePath, "utf-8")).not.toContain("description:");
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedMetaDescriptionProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const descFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(descFix).toBeDefined();
      const { fix, finding } = descFix!;

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const before = fs.readFileSync(pagePath, "utf-8");

      setApprovalStatus(db, fix.id, "rejected");
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

  it("(d) 재실행(re-plan)해도 이미 description이 채워진 페이지는 또 다른 fix로 잡히지 않는다(멱등)", async () => {
    const projectRoot = makeIsolatedMetaDescriptionProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply description fix"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(secondFix).toBeUndefined();

      const stillFlagged = secondPlan.findings.find((f) => f.rule_id === "R-META-DESCRIPTION-MISSING");
      expect(stillFlagged).toBeUndefined();
    } finally {
      db.close();
    }
  }, 300_000);
});
