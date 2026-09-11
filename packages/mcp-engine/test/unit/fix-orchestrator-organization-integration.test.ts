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
 * fix-orchestrator-jsonld-website-integration.test.ts와 완전히 동일한 격리 방식(의도적 복제).
 * 기본 fixture는 홈페이지에 title이 없어 orgName으로 복사할 값이 없으면 fixer가 report_only로
 * 폴백하므로(값 발명 금지), 성공 경로 검증을 위해 page.tsx에 metadata.title을 심는다.
 */
function makeIsolatedOrganizationProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-organization-fix-e2e-"));
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

describe("fix-orchestrator 통합 — R-JSONLD-ORG-MISSING gated fixer(루트 레이아웃 편집·승인 경로 실증)", () => {
  it("(a) 승인 없는 pending gated fix는 apply가 절대 파일을 건드리지 않는다(승인 게이트 실증)", async () => {
    const projectRoot = makeIsolatedOrganizationProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const orgFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      expect(orgFix).toBeDefined();
      expect(orgFix!.fix.risk_level).toBe("gated");
      expect(orgFix!.fix.approval_status).toBe("pending");
      expect(orgFix!.fix.applied_at).toBeNull();
      expect(orgFix!.fix.target_path).toBe(path.join("app", "layout.tsx"));

      const layoutPath = path.join(projectRoot, "app", "layout.tsx");
      const before = fs.readFileSync(layoutPath, "utf-8");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.some((o) => o.fixId === orgFix!.fix.id)).toBe(false);

      expect(fs.readFileSync(layoutPath, "utf-8")).toBe(before); // 승인 없이는 절대 안 바뀜

      const stillPending = findFixesByFinding(db, orgFix!.finding.id)[0];
      expect(stillPending.approval_status).toBe("pending");
      expect(stillPending.applied_at).toBeNull();
    } finally {
      db.close();
    }
  }, 240_000);

  it("(b) 승인 → 적용 → 실제 next build 통과 → layout.tsx에 Organization JSON-LD 반영 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedOrganizationProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const orgFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      expect(orgFix).toBeDefined();
      const { fix, finding } = orgFix!;

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
      expect(after).toContain("Organization");
      expect(after).toContain("SeoMedic 테스트 픽스처");
      expect(after).not.toContain('"url"'); // 실제 도메인을 모르니 url 필드는 넣지 않는다
      expect(after).not.toContain('"logo"');
      expect(after).not.toContain('"sameAs"');
      expect(after).toContain("{children}"); // 기존 내용 보존 확인

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();

      const rollback = await rollbackLocalFix(db, projectRoot, fix.id);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(layoutPath, "utf-8")).toBe(before); // 원본 그대로 복원
    } finally {
      db.close();
    }
  }, 240_000);

  it("(c) 거부(reject) → apply가 절대 건드리지 않고 rejected/applied_at:null 유지", async () => {
    const projectRoot = makeIsolatedOrganizationProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const orgFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      expect(orgFix).toBeDefined();
      const { fix, finding } = orgFix!;

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
    const projectRoot = makeIsolatedOrganizationProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const firstPlan = await planLocalFix(db, projectRoot);
      const firstFix = firstPlan.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      expect(firstFix).toBeDefined();
      setApprovalStatus(db, firstFix!.fix.id, "approved");
      await applyLocalFixes(db, projectRoot, firstPlan.auditRunId);

      git(projectRoot, ["add", "-A"]);
      git(projectRoot, ["-c", "user.email=test@seomedic.local", "-c", "user.name=seomedic-test", "commit", "-q", "-m", "apply organization"]);

      const secondPlan = await planLocalFix(db, projectRoot);
      const secondFix = secondPlan.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      expect(secondFix).toBeUndefined(); // 이미 마커가 있으니 새 fix를 또 만들지 않는다
    } finally {
      db.close();
    }
  }, 300_000);

  it("(e) R-JSONLD-WEBSITE-MISSING과 동시에 발생해도 같은 파일에 두 <script> 태그가 함께 정상 반영된다(겹침 안전성)", async () => {
    const projectRoot = makeIsolatedOrganizationProject();
    const db = openSeomedicDb(projectRoot);

    try {
      const planResult = await planLocalFix(db, projectRoot);
      const orgFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-ORG-MISSING");
      const websiteFix = planResult.plannedFixes.find((p) => p.finding.rule_id === "R-JSONLD-WEBSITE-MISSING");
      expect(orgFix).toBeDefined();
      expect(websiteFix).toBeDefined(); // 같은 픽스처가 애초에 JSON-LD 자체를 전혀 안 가지므로 둘 다 동시 발생

      setApprovalStatus(db, orgFix!.fix.id, "approved");
      setApprovalStatus(db, websiteFix!.fix.id, "approved");

      const outcomes = await applyLocalFixes(db, projectRoot, planResult.auditRunId);
      expect(outcomes.find((o) => o.fixId === orgFix!.fix.id)?.outcome).toBe("applied");
      expect(outcomes.find((o) => o.fixId === websiteFix!.fix.id)?.outcome).toBe("applied");

      const layoutPath = path.join(projectRoot, "app", "layout.tsx");
      const after = fs.readFileSync(layoutPath, "utf-8");
      expect(after).toContain("Organization");
      expect(after).toContain("WebSite");
      expect((after.match(/application\/ld\+json/g) ?? []).length).toBe(2); // 두 스크립트 태그 모두 보존
    } finally {
      db.close();
    }
  }, 300_000);
});
