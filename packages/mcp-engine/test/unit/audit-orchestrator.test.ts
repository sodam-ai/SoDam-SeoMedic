import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runAudit } from "../../src/orchestrator/audit-orchestrator.js";
import { findLatestBaseline, createBaseline } from "../../src/db/repositories/baseline.js";
import { classifyRegressions } from "../../src/regression/classify.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-orchestrator-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("runAudit — 실제 크롤+렌더+CWV+DB 저장 전체 파이프라인", () => {
  it("example.com을 실제로 감사하고 DB에 저장한다", async () => {
    const projectRoot = makeTempProject();
    const result = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });

    try {
      expect(result.project.target).toBe("https://example.com/");
      expect(result.auditRun.finished_at).not.toBeNull();
      expect(result.reportInput.pages).toHaveLength(1);
      expect(result.reportInput.pages[0].statusCode).toBe(200);

      // 단일 URL(depth=0)이라 CWV가 실제로 측정되어야 함
      expect(result.reportInput.pages[0].cwv).toBeDefined();
      expect(result.reportInput.pages[0].cwv?.lcpMs).toBeGreaterThan(0);

      // canonical 없음 → 실제 규칙엔진이 R-CANONICAL-MISSING을 잡아야 함
      expect(result.findings.some((f) => f.rule_id === "R-CANONICAL-MISSING")).toBe(true);

      // DB 파일이 실제로 프로젝트 루트 안에 생겼는지 확인
      expect(fs.existsSync(path.join(projectRoot, ".seomedic", "seomedic.db"))).toBe(true);
    } finally {
      result.db.close();
    }
  }, 60_000);

  it("같은 프로젝트에 2번째 audit 실행 시 project가 재사용된다(중복 project 생성 안 됨)", async () => {
    const projectRoot = makeTempProject();
    const result1 = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
    result1.db.close();

    const result2 = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
    try {
      expect(result2.project.id).toBe(result1.project.id);
    } finally {
      result2.db.close();
    }
  }, 90_000);

  it("baseline 저장 후 재감사로 회귀 판정까지 실제 파이프라인으로 확인", async () => {
    const projectRoot = makeTempProject();
    const result1 = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
    const baseline = createBaseline(result1.db, result1.project.id, result1.findings, "user_ack");
    result1.db.close();

    const result2 = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
    try {
      const snapshot = JSON.parse(baseline.snapshot);
      const { revertedKeys } = classifyRegressions(result2.findings, snapshot);
      // 같은 페이지를 재감사했으니 findings가 baseline과 동일해야 하고, 회귀도 없어야 함
      expect(revertedKeys).toEqual([]);
      expect(findLatestBaseline(result2.db, result2.project.id)?.id).toBe(baseline.id);
    } finally {
      result2.db.close();
    }
  }, 90_000);
});
