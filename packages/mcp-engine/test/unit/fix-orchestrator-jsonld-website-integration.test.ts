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
 * fix-orchestrator-og-integration.test.ts의 makeIsolatedOgProject와 동일한 격리 방식. 기본 fixture는
 * 홈페이지에 title이 없어(실제 파일 확인됨) siteName으로 복사할 값이 없으면 fixer가 report_only로
 * 폴백한다(값 발명 금지 원칙) — 성공 경로를 검증하려면 title을 심어야 하므로 OG 테스트와 동일하게
 * page.tsx에 `export const metadata`를 추가한다. layout.tsx(수정 대상)는 fixture 원본 그대로 둔다.
 */
function makeIsolatedJsonLdProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-jsonld-website-fix-e2e-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.next`),
  });

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
  );

  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "initial"]);

  return tempDir;
}

describe("fix-orchestrator 통합 — R-JSONLD-WEBSITE-MISSING gated fixer(루트 레이아웃 편집·승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 파일을 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedJsonLdProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const jsonLdFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(jsonLdFix).toBeDefined();
      expect(jsonLdFix!.fix.risk_level).toBe("gated");
      expect(jsonLdFix!.fix.approval_status).toBe("pending");
      expect(jsonLdFix!.fix.applied_at).toBeNull();
      expect(jsonLdFix!.fix.target_path).toBe(path.join("app", "layout.tsx"));

      const layoutPath = path.join(projectRoot, "app", "layout.tsx");
      const before = fs.readFileSync(layoutPath, "utf-8");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes).toHaveLength(0);

      expect(fs.readFileSync(layoutPath, "utf-8")).toBe(before); // 승인 없이는 절대 안 바뀜

      const stillPending = findFixesByFinding(db, jsonLdFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → layout.tsx에 WebSite JSON-LD 반영 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedJsonLdProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const jsonLdFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(jsonLdFix).toBeDefined();
      const { fix, finding } = jsonLdFix!;

      const layoutPath = path.join(projectRoot, "app", "layout.tsx");
      const before = fs.readFileSync(layoutPath, "utf-8");

      const approval = setApprovalStatus(db, fix.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      const outcome = outcomes.find((o) => o.fixId === fix.id);
      expect(outcome).toBeDefined();
      expect(outcome!.outcome).toBe("applied");

      const after = fs.readFileSync(layoutPath, "utf-8");
      expect(after).toContain("application/ld+json");
      expect(after).toContain("WebSite");
      expect(after).toContain("SeoMedic 테스트 픽스처");
      expect(after).not.toContain('"url"'); // 실제 도메인을 모르니 url 필드는 넣지 않는다
      expect(after).toContain("{children}"); // 기존 내용 보존 확인

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull(); // 기존 파일 수정이라 canonical/OG/noindex와 동일하게 백업 존재

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(layoutPath, "utf-8")).toBe(before); // 원본 그대로 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedJsonLdProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const jsonLdFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(jsonLdFix).toBeDefined();
      const { fix, finding } = jsonLdFix!;

      const layoutPath = path.join(projectRoot, "app", "layout.tsx");
      const before = fs.readFileSync(layoutPath, "utf-8");

      const rejection = setApprovalStatus(db, fix.id, "rejected");
      expect(rejection.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === fix.id)).toBe(false);

      expect(fs.readFileSync(layoutPath, "utf-8")).toBe(before);

      const stillRejected = findFixesByFinding(db, finding.id)[0];
      expect(stillRejected.approval_status).toBe("rejected");
      expect(stillRejected.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(d) 재실행(re-plan)해도 이미 반영된 layout.tsx는 또 다른 fix로 잡히지 않는다(멱등)", async () => {
    const projectRoot = makeIsolatedJsonLdProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      // 적용 후 남은 변경사항(layout.tsx 수정)을 커밋해 git-clean 상태를 다시 만든다(재실행 전제조건).
      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply jsonld"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(secondFix).toBeUndefined(); // 이미 마커가 있으니 새 fix를 또 만들지 않는다

      // R-JSONLD-MISSING(페이지별 탐지 규칙)도 더 이상 발화하지 않아야 한다 — layout에 site-wide
      // JSON-LD가 생겼으니 렌더 시 모든 페이지에 나타나 실제로 문제가 해소된 것이 자연스럽게 반영됨.
      const stillMissing = secondPlan.reportOnlyFindings.find((f) => f.rule_id === "R-JSONLD-MISSING");
      expect(stillMissing).toBeUndefined();
    } finally {
      db.close();
    }
  }, 300_000);
});
