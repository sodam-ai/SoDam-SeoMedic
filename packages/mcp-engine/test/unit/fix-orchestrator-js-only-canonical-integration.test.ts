import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { openSeomedicDb } from "../../src/db/connection.js";
import { findOrCreateProject } from "../../src/db/repositories/project.js";
import { startAuditRun } from "../../src/db/repositories/audit-run.js";
import { insertFindings } from "../../src/db/repositories/finding.js";
import { findFixesByFinding, setApprovalStatus } from "../../src/db/repositories/fix.js";
import { applyLocalFixes } from "../../src/fix-orchestrator/apply.js";
import { rollbackLocalFix } from "../../src/fix-orchestrator/rollback.js";
import { planJsOnlyCanonicalFixForFinding } from "../../src/fix-orchestrator/plan.js";
import type { ScannedPage } from "../../src/fix-orchestrator/scan.js";

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
 * fix-orchestrator-canonical-integration.test.ts의 makeIsolatedCanonicalProject와 동일한 격리 방식
 * (별도 임시 폴더 + node_modules 통째 복사 + 독립 git repo) — 공유 test/fixtures/nextjs-minimal/의
 * 원본은 절대 건드리지 않는다. 홈페이지는 정적 metadata(title만, alternates 없음)만 갖게 해
 * canonical-fixer.ts의 findStaticMetadataObject가 정적 object literal로 인식할 수 있게 한다
 * (R-CANONICAL-MISSING 테스트와 동일한 페이지 형태 — 두 rule 모두 "정적 metadata에 alternates.canonical만
 * 추가"라는 동일한 파일 구조 전제조건을 공유하기 때문).
 */
function makeIsolatedJsOnlyCanonicalProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-jsonly-canonical-fix-e2e-"));
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

/** planJsOnlyCanonicalFixForFinding 직접 호출에 필요한 DB 뼈대(project+audit_run+finding)를
 * scan/rule 평가 없이 최소한으로 만든다 — 이 테스트의 목적은 "값 보존" 로직 자체이지 크롤/렌더
 * 파이프라인 재검증이 아니므로(그건 scan.test.ts가 이미 담당), 여기서 다시 반복하지 않는다. */
function seedProjectFindingFixture(projectRoot: string, pageUrl: string) {
  const db = openSeomedicDb(projectRoot);
  const project = findOrCreateProject(db, {
    target: projectRoot,
    mode: "analyze-fix",
    sourceAvailable: true,
    detectedStack: "nextjs@test",
  });
  const auditRun = startAuditRun(db, project.id, "technical");
  const [finding] = insertFindings(db, auditRun.id, [
    {
      ruleId: "R-CANONICAL-JS-ONLY",
      ruleVersion: 1,
      category: "canonical",
      severity: "critical",
      pageUrl,
      currentValue: "canonical은 JS로만 존재",
      recommendedValue: 'raw HTML에 <link rel="canonical" href="...">직접 추가',
    },
  ]);
  return { db, auditRun, finding };
}

describe("fix-orchestrator 통합 — R-CANONICAL-JS-ONLY gated fixer(JS 계산값 보존 검증)", () => {
  it("(1) JS가 계산한 canonical이 페이지 자기 경로와 다른 값이어도 그대로 보존해 idempotency_marker에 저장한다(자기참조 가정 금지 — 핵심 설계 결정 증명)", () => {
    const projectRoot = makeIsolatedJsOnlyCanonicalProject();
    const pageUrl = "http://local.seomedic.internal/";
    const { db, finding } = seedProjectFindingFixture(projectRoot, pageUrl);

    try {
      // 페이지 자기 경로는 "/"이지만, JS가 실제로 계산해 렌더링한 canonical은 페이지네이션 1페이지처럼
      // 완전히 다른 경로("/archive")를 가리킨다 — 이 값이 그대로 보존돼야 하며, "/"로 대체되면 실패해야 한다.
      const pages: ScannedPage[] = [
        {
          logicalUrl: pageUrl,
          realUrl: "http://127.0.0.1:59999/",
          statusCode: 200,
          rawHtml: "<html><head><title>t</title></head><body></body></html>",
          violations: [],
          renderedCanonical: "/archive",
          renderedTitle: null,
        },
      ];

      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, pages);

      expect(fix).not.toBeNull();
      expect(fix!.risk_level).toBe("gated");
      expect(fix!.approval_status).toBe("pending");
      // 핵심 단언: 자기 경로("/")가 아니라 JS가 계산한 실제 값("/archive")이 보존되어야 한다.
      expect(fix!.idempotency_marker).toBe("/archive");
      expect(fix!.idempotency_marker).not.toBe("/");
      expect(fix!.dry_run_diff).toContain("/archive");
    } finally {
      db.close();
    }
  });

  it("(1b) 방어적 fail-closed: pages 배열에 해당 finding의 page_url이 없으면 null(추측하지 않음)", () => {
    const projectRoot = makeIsolatedJsOnlyCanonicalProject();
    const pageUrl = "http://local.seomedic.internal/";
    const { db, finding } = seedProjectFindingFixture(projectRoot, pageUrl);

    try {
      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, []);
      expect(fix).toBeNull();
    } finally {
      db.close();
    }
  });

  it("(1c) 방어적 fail-closed: renderedCanonical이 null인 페이지면 null(값 추측·자기참조 폴백 금지)", () => {
    const projectRoot = makeIsolatedJsOnlyCanonicalProject();
    const pageUrl = "http://local.seomedic.internal/";
    const { db, finding } = seedProjectFindingFixture(projectRoot, pageUrl);

    try {
      const pages: ScannedPage[] = [
        {
          logicalUrl: pageUrl,
          realUrl: "http://127.0.0.1:59999/",
          statusCode: 200,
          rawHtml: "<html></html>",
          violations: [],
          renderedCanonical: null,
          renderedTitle: null,
        },
      ];
      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, pages);
      expect(fix).toBeNull();
    } finally {
      db.close();
    }
  });

  it("(1d) 방어적 fail-closed: 정적 페이지 파일을 찾을 수 없으면(동적 라우트 등) null", () => {
    const projectRoot = makeIsolatedJsOnlyCanonicalProject();
    const pageUrl = "http://local.seomedic.internal/nowhere";
    const { db, finding } = seedProjectFindingFixture(projectRoot, pageUrl);

    try {
      const pages: ScannedPage[] = [
        {
          logicalUrl: pageUrl,
          realUrl: "http://127.0.0.1:59999/nowhere",
          statusCode: 200,
          rawHtml: "<html></html>",
          violations: [],
          renderedCanonical: "/somewhere-else",
          renderedTitle: null,
        },
      ];
      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, pages);
      expect(fix).toBeNull();
    } finally {
      db.close();
    }
  });

  it("(2) 승인 → 적용 → 실제 next build 통과 → 파일에 보존된(비자기참조) 값 반영 → rollback으로 원복", async () => {
    const projectRoot = makeIsolatedJsOnlyCanonicalProject();
    const pageUrl = "http://local.seomedic.internal/";
    const { db, auditRun, finding } = seedProjectFindingFixture(projectRoot, pageUrl);

    try {
      const pages: ScannedPage[] = [
        {
          logicalUrl: pageUrl,
          realUrl: "http://127.0.0.1:59999/",
          statusCode: 200,
          rawHtml: "<html><head><title>t</title></head><body></body></html>",
          violations: [],
          renderedCanonical: "/archive", // 자기 경로("/")와 다른 값 — 보존 여부가 이 테스트의 핵심
          renderedTitle: null,
        },
      ];
      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, pages);
      expect(fix).not.toBeNull();

      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const beforeApply = fs.readFileSync(pagePath, "utf-8");
      expect(beforeApply).not.toContain("alternates");

      const approval = setApprovalStatus(db, fix!.id, "approved");
      expect(approval.changed).toBe(true);

      const outcomes = await applyLocalFixes(db, projectRoot, auditRun.id);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe("applied");

      const afterApply = fs.readFileSync(pagePath, "utf-8");
      // 보존된 JS 계산값("/archive")이 그대로 반영되어야 하고, 자기참조("/")로 대체되면 안 된다.
      expect(afterApply).toContain('alternates: { canonical: "/archive" }');
      expect(afterApply).not.toContain('alternates: { canonical: "/" }');

      const appliedFix = findFixesByFinding(db, finding.id)[0];
      expect(appliedFix.applied_at).not.toBeNull();
      expect(appliedFix.backup_path).not.toBeNull();
      expect(fs.existsSync(appliedFix.backup_path!)).toBe(true);

      const rollback = await rollbackLocalFix(db, projectRoot, fix!.id);
      expect(rollback.restored).toBe(true);
      const afterRollback = fs.readFileSync(pagePath, "utf-8");
      expect(afterRollback).toBe(beforeApply);
    } finally {
      db.close();
    }
  }, 240_000);
});
