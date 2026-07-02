import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSeomedicDb } from "../../src/db/connection.js";
import { findOrCreateProject } from "../../src/db/repositories/project.js";
import { startAuditRun, finishAuditRun } from "../../src/db/repositories/audit-run.js";
import { insertFindings, findFindingsByAuditRun, updateFindingStatus } from "../../src/db/repositories/finding.js";
import { createBaseline, findLatestBaseline, type BaselineSnapshot } from "../../src/db/repositories/baseline.js";
import { createRegressionRecord } from "../../src/db/repositories/regression.js";
import { classifyRegressions } from "../../src/regression/classify.js";
import type { RuleViolation } from "../../src/rules/types.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-regression-test-"));
  cleanupDirs.push(dir);
  return dir;
}

const CANONICAL_MISSING: RuleViolation = {
  ruleId: "R-CANONICAL-MISSING",
  ruleVersion: 1,
  category: "canonical",
  severity: "high",
  pageUrl: "https://example.com/about",
  currentValue: null,
  recommendedValue: "self-canonical 추가",
};

/**
 * PRD 01_PRD.md 성공기준: "같은 프로젝트 두 번 검사 시 원복 항목 1개 이상 안정 키로 정확 탐지".
 * 03_PHASES.md M6 검증 방법 그대로: "2회 audit 통합테스트".
 */
describe("회귀 감지 — 실제 2회 audit 시나리오(PRD 성공기준 그대로)", () => {
  it("1차 감사(canonical 정상) → 베이스라인 저장 → 2차 감사(canonical 사라짐) → 원복 1건 정확 탐지", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const project = findOrCreateProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });

    // 1차 감사: canonical이 정상이라 위반 없음
    const run1 = startAuditRun(db, project.id, "technical");
    const findings1 = insertFindings(db, run1.id, []); // 문제 없음
    finishAuditRun(db, run1.id, null);
    expect(findings1).toHaveLength(0);

    // 사용자가 명시적으로 베이스라인 저장(1차 시점 상태)
    const baseline = createBaseline(db, project.id, findFindingsByAuditRun(db, run1.id), "user_ack");
    const snapshot: BaselineSnapshot = JSON.parse(baseline.snapshot);
    expect(Object.keys(snapshot)).toHaveLength(0); // 문제가 없었으니 스냅샷도 비어있음

    // 2차 감사: 실수로 canonical이 사라짐 → 새 finding 발생
    const run2 = startAuditRun(db, project.id, "technical");
    const findings2 = insertFindings(db, run2.id, [CANONICAL_MISSING]);
    finishAuditRun(db, run2.id, null);
    expect(findings2).toHaveLength(1);

    // 회귀 판정
    const { revertedKeys, classification } = classifyRegressions(findings2, snapshot);
    expect(revertedKeys).toHaveLength(1);
    expect(revertedKeys[0]).toBe(findings2[0].finding_key);
    expect(classification[findings2[0].finding_key]).toBe("regression");

    // 결과 저장
    const regRecord = createRegressionRecord(db, project.id, baseline.id, revertedKeys, classification);
    expect(JSON.parse(regRecord.reverted_keys)).toEqual(revertedKeys);

    db.close();
  });

  it("사용자가 회귀를 승인(acknowledged)하면 그 다음 베이스라인부터는 재발해도 회귀로 안 뜬다", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);
    const project = findOrCreateProject(db, { target: "https://example.com", mode: "analyze", sourceAvailable: false });

    // 1차: 문제 없음 → 빈 베이스라인
    const run1 = startAuditRun(db, project.id, "technical");
    finishAuditRun(db, run1.id, null);
    const baseline1 = createBaseline(db, project.id, [], "user_ack");

    // 2차: 문제 발생 → 회귀 탐지됨
    const run2 = startAuditRun(db, project.id, "technical");
    const [finding2] = insertFindings(db, run2.id, [CANONICAL_MISSING]);
    finishAuditRun(db, run2.id, null);
    const round2 = classifyRegressions([finding2], JSON.parse(baseline1.snapshot));
    expect(round2.classification[finding2.finding_key]).toBe("regression");

    // 사용자가 "이건 의도한 거야"라고 승인 → status 변경 + 새 베이스라인 저장
    updateFindingStatus(db, finding2.id, "acknowledged");
    const findingsAfterAck = findFindingsByAuditRun(db, run2.id);
    const baseline2 = createBaseline(db, project.id, findingsAfterAck, "user_ack");
    expect(findLatestBaseline(db, project.id)?.id).toBe(baseline2.id);

    // 3차: 같은 문제가 여전히 존재(재발이 아니라 계속 있는 것) → 이제는 회귀로 안 뜬다
    const run3 = startAuditRun(db, project.id, "technical");
    const [finding3] = insertFindings(db, run3.id, [CANONICAL_MISSING]);
    finishAuditRun(db, run3.id, null);
    const round3 = classifyRegressions([finding3], JSON.parse(baseline2.snapshot));
    expect(round3.revertedKeys).toEqual([]); // 이미 승인된 문제라 재알림 없음

    db.close();
  });
});
