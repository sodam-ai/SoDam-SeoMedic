import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSeomedicDb } from "../../src/db/connection.js";
import { createProject } from "../../src/db/repositories/project.js";
import { startAuditRun } from "../../src/db/repositories/audit-run.js";
import { insertFindings } from "../../src/db/repositories/finding.js";
import {
  insertFix,
  findFixById,
  findFixesByFinding,
  findPendingFixes,
  setApprovalStatus,
  markApplied,
} from "../../src/db/repositories/fix.js";
import type { RuleViolation } from "../../src/rules/types.js";
import type { SeomedicDb } from "../../src/db/connection.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-fix-repo-test-"));
  cleanupDirs.push(dir);
  return dir;
}

/** Fix는 Finding에 1:N이라 테스트마다 실제 Finding 하나를 먼저 만들어야 한다(FK 제약). */
function makeTestFinding(db: SeomedicDb): { findingId: number } {
  const project = createProject(db, { target: "https://example.com", mode: "analyze-fix", sourceAvailable: true });
  const run = startAuditRun(db, project.id, "technical");
  const violation: RuleViolation = {
    ruleId: "R-SITEMAP-MISSING-URL",
    ruleVersion: 1,
    category: "indexing",
    severity: "medium",
    pageUrl: "https://example.com/new-page",
    currentValue: null,
    recommendedValue: "sitemap에 추가",
  };
  const [finding] = insertFindings(db, run.id, [violation]);
  return { findingId: finding.id };
}

describe("fix 리포지토리 — 실제 SQLite 파일", () => {
  it("insertFix로 add_safe(auto) fix를 생성하고 조회한다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    const fix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "add_safe",
      approvalStatus: "auto",
      dryRunDiff: "+ { url: 'https://example.com/new-page' }",
      targetPath: "app/sitemap.ts",
    });

    expect(fix.id).toBeGreaterThan(0);
    expect(fix.approval_status).toBe("auto");
    expect(fix.applied_at).toBeNull();
    expect(findFixById(db, fix.id)?.finding_id).toBe(findingId);
    expect(findFixesByFinding(db, findingId)).toHaveLength(1);

    db.close();
  });

  it("gated fix는 pending으로 생성되고 findPendingFixes에 잡힌다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "gated",
      approvalStatus: "pending",
      dryRunDiff: "- <meta name=\"robots\" content=\"noindex\">",
    });

    const pending = findPendingFixes(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].risk_level).toBe("gated");

    db.close();
  });

  it("setApprovalStatus — pending에서 approved로 전이 성공(changed=true)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);
    const fix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "gated",
      approvalStatus: "pending",
      dryRunDiff: "diff",
    });

    const result = setApprovalStatus(db, fix.id, "approved");
    expect(result.changed).toBe(true);
    expect(result.fix?.approval_status).toBe("approved");

    db.close();
  });

  it("setApprovalStatus — 이미 approved인 fix를 다시 approve/reject 시도하면 상태머신이 막는다(changed=false)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);
    const fix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "gated",
      approvalStatus: "pending",
      dryRunDiff: "diff",
    });
    setApprovalStatus(db, fix.id, "approved");

    // 이미 approved인 상태에서 reject를 걸어도 통과되면 안 됨(재승인 남용/상태 되돌리기 공격 방지)
    const second = setApprovalStatus(db, fix.id, "rejected");
    expect(second.changed).toBe(false);
    expect(second.fix?.approval_status).toBe("approved"); // 여전히 approved — rejected로 안 바뀜

    db.close();
  });

  it("markApplied — approved/auto 상태의 fix만 적용 기록이 남는다(승인 게이트를 UPDATE 조건에도 이중화)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    const autoFix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "add_safe",
      approvalStatus: "auto",
      dryRunDiff: "diff",
    });
    const appliedResult = markApplied(db, autoFix.id, "2026-07-03T00:00:00.000Z", "/backup/path");
    expect(appliedResult.changed).toBe(true);
    expect(appliedResult.fix?.applied_at).toBe("2026-07-03T00:00:00.000Z");
    expect(appliedResult.fix?.backup_path).toBe("/backup/path");

    db.close();
  });

  it("markApplied — pending(미승인) fix에 적용을 시도하면 거부된다(changed=false, applied_at 그대로 null)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    const pendingFix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "gated",
      approvalStatus: "pending",
      dryRunDiff: "diff",
    });
    const result = markApplied(db, pendingFix.id, "2026-07-03T00:00:00.000Z", null);

    expect(result.changed).toBe(false);
    expect(result.fix?.applied_at).toBeNull(); // 승인 없이는 절대 미변경(PRD 성공기준과 동일 불변식)

    db.close();
  });

  it("markApplied — rejected fix에 적용을 시도해도 거부된다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    const fix = insertFix(db, {
      findingId,
      fixType: "file_edit",
      riskLevel: "gated",
      approvalStatus: "pending",
      dryRunDiff: "diff",
    });
    setApprovalStatus(db, fix.id, "rejected");

    const result = markApplied(db, fix.id, "2026-07-03T00:00:00.000Z", null);
    expect(result.changed).toBe(false);
    expect(result.fix?.applied_at).toBeNull();

    db.close();
  });

  it("fix_type/risk_level에 없는 값을 넣으면 CHECK 제약으로 거부된다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { findingId } = makeTestFinding(db);

    expect(() =>
      insertFix(db, {
        findingId,
        // @ts-expect-error 의도적으로 잘못된 값 주입 — CHECK 제약이 실제로 걸려있는지 실행 검증
        fixType: "delete_everything",
        riskLevel: "gated",
        approvalStatus: "pending",
        dryRunDiff: "diff",
      }),
    ).toThrow();

    db.close();
  });
});
