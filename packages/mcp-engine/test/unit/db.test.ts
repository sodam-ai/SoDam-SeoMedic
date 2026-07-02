import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { openSeomedicDb } from "../../src/db/connection.js";
import { createProject, findOrCreateProject } from "../../src/db/repositories/project.js";
import { startAuditRun, finishAuditRun } from "../../src/db/repositories/audit-run.js";
import { createPage, findPagesByAuditRun } from "../../src/db/repositories/page.js";
import { insertFindings, findFindingsByAuditRun, updateFindingStatus } from "../../src/db/repositories/finding.js";
import { createBaseline, findLatestBaseline } from "../../src/db/repositories/baseline.js";
import { createRegressionRecord, findRegressionsByProject } from "../../src/db/repositories/regression.js";
import type { RuleViolation } from "../../src/rules/types.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-db-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("전체 DB 파이프라인 — 실제 SQLite 파일(메모리 아님)", () => {
  it("Project → AuditRun → Page → Finding까지 실제 저장·조회", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);

    const project = createProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });
    expect(project.id).toBeGreaterThan(0);

    const run = startAuditRun(db, project.id, "technical");
    expect(run.finished_at).toBeNull();

    const rawHtml = "<html><body>hello</body></html>";
    const page = createPage(db, {
      auditRunId: run.id,
      url: "https://example.com/",
      statusCode: 200,
      rawHasContent: true,
      rawHtml,
    });
    expect(page.html_hash).toBe(createHash("sha256").update(rawHtml).digest("hex"));
    expect(page.html_excerpt).toBe(rawHtml); // 500자 미만이라 원문 그대로가 요약임

    const violations: RuleViolation[] = [
      {
        ruleId: "R-CANONICAL-MISSING",
        ruleVersion: 1,
        category: "canonical",
        severity: "high",
        pageUrl: "https://example.com/",
        currentValue: null,
        recommendedValue: "self-canonical 추가",
      },
    ];
    const findings = insertFindings(db, run.id, violations);
    expect(findings).toHaveLength(1);
    expect(findings[0].finding_key).toHaveLength(16);

    finishAuditRun(db, run.id, 72);

    expect(findPagesByAuditRun(db, run.id)).toHaveLength(1);
    expect(findFindingsByAuditRun(db, run.id)).toHaveLength(1);

    db.close();
  });

  it("SQL 파라미터 바인딩 — 악의적 문자열이 그대로 값으로 저장되고 실행되지 않는다", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);

    const maliciousTarget = "https://x.com'; DROP TABLE project; --";
    const project = createProject(db, { target: maliciousTarget, mode: "analyze", sourceAvailable: false });

    // 테이블이 실제로 살아있고, target 값이 그대로(이스케이프 없이 원문 그대로) 저장됐는지 확인
    expect(project.target).toBe(maliciousTarget);
    const stillExists = db.prepare(`SELECT COUNT(*) as cnt FROM project`).get() as { cnt: number };
    expect(stillExists.cnt).toBe(1); // DROP TABLE이 실행됐다면 이 쿼리 자체가 에러났을 것

    db.close();
  });

  it("finding_key로 실행 간(다른 AuditRun) 같은 문제를 매칭한다 — 회귀 감지의 뼈대", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const project = createProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });

    const violation: RuleViolation = {
      ruleId: "R-CANONICAL-MISSING",
      ruleVersion: 1,
      category: "canonical",
      severity: "high",
      pageUrl: "https://example.com/page",
      currentValue: null,
      recommendedValue: "x",
    };

    const run1 = startAuditRun(db, project.id, "technical");
    const [finding1] = insertFindings(db, run1.id, [violation]);
    finishAuditRun(db, run1.id, null);

    const run2 = startAuditRun(db, project.id, "technical");
    const [finding2] = insertFindings(db, run2.id, [violation]); // 두 번째 실행, 같은 문제
    finishAuditRun(db, run2.id, null);

    expect(finding1.finding_key).toBe(finding2.finding_key);
    expect(finding1.id).not.toBe(finding2.id); // id는 실행 내부 지역 ID라 서로 다름(v1.1 결함수정 반영 확인)

    db.close();
  });

  it("Baseline은 명시적으로 호출해야만 생성된다(자동 생성 없음을 코드 구조로 증명)", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const project = createProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });
    const run = startAuditRun(db, project.id, "technical");
    const violations: RuleViolation[] = [
      {
        ruleId: "R-CANONICAL-MISSING",
        ruleVersion: 1,
        category: "canonical",
        severity: "high",
        pageUrl: "https://example.com/",
        currentValue: null,
        recommendedValue: "x",
      },
    ];
    const findings = insertFindings(db, run.id, violations);
    finishAuditRun(db, run.id, null);

    // audit 완료 직후에도 baseline은 존재하지 않아야 한다(자동 생성 X)
    expect(findLatestBaseline(db, project.id)).toBeUndefined();

    // 사용자가 명시적으로 저장을 요청한 경우에만 생성
    const baseline = createBaseline(db, project.id, findings, "user_ack");
    expect(baseline.created_by).toBe("user_ack");
    expect(findLatestBaseline(db, project.id)?.id).toBe(baseline.id);

    const snapshot = JSON.parse(baseline.snapshot);
    expect(snapshot[findings[0].finding_key]).toEqual({ category: "canonical", severity: "high", status: "open" });

    db.close();
  });

  it("Regression 레코드 저장·조회", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const project = createProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });
    const run = startAuditRun(db, project.id, "technical");
    const [finding] = insertFindings(db, run.id, [
      {
        ruleId: "R-CANONICAL-MISSING",
        ruleVersion: 1,
        category: "canonical",
        severity: "high",
        pageUrl: "https://example.com/",
        currentValue: null,
        recommendedValue: "x",
      },
    ]);
    finishAuditRun(db, run.id, null);
    const baseline = createBaseline(db, project.id, [finding], "user_ack");

    updateFindingStatus(db, finding.id, "reverted");
    const reg = createRegressionRecord(db, project.id, baseline.id, [finding.finding_key], {
      [finding.finding_key]: "regression",
    });

    const found = findRegressionsByProject(db, project.id);
    expect(found).toHaveLength(1);
    expect(JSON.parse(found[0].reverted_keys)).toEqual([finding.finding_key]);
    expect(JSON.parse(found[0].classification)[finding.finding_key]).toBe("regression");
    expect(reg.id).toBe(found[0].id);

    db.close();
  });

  it("findOrCreateProject — 같은 target이면 재사용", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const p1 = findOrCreateProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });
    const p2 = findOrCreateProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });
    expect(p1.id).toBe(p2.id);
    db.close();
  });
});
