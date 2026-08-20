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
      // 실제 크롤된 페이지 1개 + robots.txt 기준 AI 크롤러 정책 가상 페이지 1개(R-AI-CRAWLER-POLICY, 사이트 단위 리포트)
      expect(result.reportInput.pages).toHaveLength(2);
      const robotsTxtEntry = result.reportInput.pages.find((p) => p.url.endsWith("/robots.txt"));
      const crawledPage = result.reportInput.pages.find((p) => p.url === "https://example.com/");
      expect(robotsTxtEntry).toBeDefined();
      expect(crawledPage).toBeDefined();
      expect(crawledPage!.statusCode).toBe(200);

      // 단일 URL(depth=0)이라 CWV가 실제로 측정되어야 함
      expect(crawledPage!.cwv).toBeDefined();
      expect(crawledPage!.cwv?.lcpMs).toBeGreaterThan(0);

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
      // Phase 2에서 추가된 신규 규칙(JSON-LD·OG·AI크롤러 정책)이 실제로 finding_key 안정성까지
      // 갖췄는지는 코드 리뷰만으론 확인 불가(정적 분석 ≠ 실측) — 여기서 명시적으로 고정한다.
      // 이 3종은 실제로 example.com에서 항상 발화하므로(canonical 없음·JSON-LD 없음·OG/meta
      // description 없음·robots.txt 없음) 매 실행마다 반드시 나타나야 하는 회귀가드다.
      const ruleIds1 = result1.findings.map((f) => f.rule_id).sort();
      for (const ruleId of ["R-JSONLD-MISSING", "R-OG-BASIC-MISSING", "R-AI-CRAWLER-POLICY"]) {
        expect(ruleIds1).toContain(ruleId);
      }

      const snapshot = JSON.parse(baseline.snapshot);
      const { revertedKeys } = classifyRegressions(result2.findings, snapshot);
      // 같은 페이지를 재감사했으니 findings가 baseline과 동일해야 하고, 회귀도 없어야 함
      expect(revertedKeys).toEqual([]);
      // rule_id 집합 자체가 1차/2차 사이 완전히 동일한지도 확인(어느 한쪽에서만 조용히
      // 누락되는 경우 revertedKeys=[]만으로는 못 잡는다 — "사라진 finding"은 classifyRegressions의
      // 관심사가 아니므로 별도로 개수·집합을 대조해야 한다).
      const ruleIds2 = result2.findings.map((f) => f.rule_id).sort();
      expect(ruleIds2).toEqual(ruleIds1);
      expect(findLatestBaseline(result2.db, result2.project.id)?.id).toBe(baseline.id);
    } finally {
      result2.db.close();
    }
  }, 90_000);

  describe("GSC/GA4 배선 — env var 기반 선택 기능", () => {
    const GSC_GA4_ENV_KEYS = ["GSC_SERVICE_ACCOUNT_PATH", "GSC_PROPERTY_SCOPE", "GA4_PROPERTY_ID"] as const;
    const savedEnv: Record<string, string | undefined> = {};

    afterEach(() => {
      for (const key of GSC_GA4_ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    });

    it("env var 미설정 시 gsc/ga4/*Error 전부 undefined(기존 동작 무변화, 하위 호환)", async () => {
      for (const key of GSC_GA4_ENV_KEYS) delete process.env[key];
      const projectRoot = makeTempProject();
      const result = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
      try {
        expect(result.reportInput.gsc).toBeUndefined();
        expect(result.reportInput.gscError).toBeUndefined();
        expect(result.reportInput.ga4).toBeUndefined();
        expect(result.reportInput.ga4Error).toBeUndefined();
      } finally {
        result.db.close();
      }
    }, 60_000);

    it("설정은 됐지만 인증 실패(존재하지 않는 키 파일)하면 침묵하지 않고 gscError/ga4Error에 사유가 남는다(PSI와 다른 지점 — 실제 end-to-end 배선 검증)", async () => {
      for (const key of GSC_GA4_ENV_KEYS) savedEnv[key] = process.env[key];
      process.env.GSC_SERVICE_ACCOUNT_PATH = "/definitely/does/not/exist/key.json";
      process.env.GSC_PROPERTY_SCOPE = "sc-domain:my-site.com";
      process.env.GA4_PROPERTY_ID = "123456789";

      const projectRoot = makeTempProject();
      const result = await runAudit({ url: "https://example.com/", projectRoot, siteMode: false });
      try {
        expect(result.reportInput.gsc).toBeUndefined();
        expect(result.reportInput.gscError).toBeDefined();
        expect(result.reportInput.gscError).toContain("인증 실패");
        expect(result.reportInput.ga4).toBeUndefined();
        expect(result.reportInput.ga4Error).toBeDefined();
        expect(result.reportInput.ga4Error).toContain("인증 실패");
      } finally {
        result.db.close();
      }
    }, 60_000);
  });
});
