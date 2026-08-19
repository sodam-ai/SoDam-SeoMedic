import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planRobotsAiPolicyFix, writeRobotsAiPolicyFix, ROBOTS_AI_POLICY_MARKER } from "../../src/fixers/robots-ai-policy-fixer.js";
import { AI_CRAWLER_CATALOG } from "../../src/crawler/ai-crawler-policy.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempFilePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-robots-ai-fix-test-"));
  cleanupDirs.push(dir);
  return path.join(dir, "robots.ts");
}

describe("planRobotsAiPolicyFix — robots.ts 없음(신규 생성 제안)", () => {
  it("파일이 없으면 applicable=true로 새 파일 내용을 제안한다", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBeDefined();
  });

  it("생성될 내용은 MetadataRoute.Robots 기본 export 형태다", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    expect(plan.updatedText).toContain("import type { MetadataRoute } from \"next\"");
    expect(plan.updatedText).toContain("export default function robots(): MetadataRoute.Robots");
  });

  it("학습 목적(training) 크롤러만 disallow 대상에 포함하고, 검색/사용자요청 목적은 포함하지 않는다", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    const trainingTokens = AI_CRAWLER_CATALOG.filter((e) => e.purpose === "training").map((e) => e.token);
    const nonTrainingTokens = AI_CRAWLER_CATALOG.filter((e) => e.purpose !== "training").map((e) => e.token);

    for (const token of trainingTokens) {
      expect(plan.updatedText).toContain(token);
    }
    // 비학습(검색/사용자요청) 토큰은 disallow 목록에 없어야 한다 — 전부 기본 "*" allow 규칙으로 커버됨.
    // (검색 토큰 문자열이 우연히 포함될 수 있는 다른 텍스트가 없는지도 함께 확인)
    const disallowLine = plan.updatedText!.split("\n").find((l) => l.includes("disallow"));
    for (const token of nonTrainingTokens) {
      expect(disallowLine).not.toContain(token);
    }
  });

  it("기본 규칙(*)은 전체 허용이다(검색엔진 크롤 방해 금지)", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    expect(plan.updatedText).toContain('{ userAgent: "*", allow: "/" }');
  });

  it("생성 내용에 재실행 감지용 마커가 포함된다", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    expect(plan.updatedText).toContain(ROBOTS_AI_POLICY_MARKER);
  });

  it("writeRobotsAiPolicyFix가 실제로 디스크에 새 파일을 만든다", () => {
    const filePath = tempFilePath();
    const plan = planRobotsAiPolicyFix(filePath);
    writeRobotsAiPolicyFix(filePath, plan.updatedText!);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(plan.updatedText);
  });
});

describe("planRobotsAiPolicyFix — robots.ts가 이미 존재(멱등/충돌 구분)", () => {
  it("우리가 만든 파일(마커 포함)이 이미 있으면 alreadyApplied=true로 손대지 않는다", () => {
    const filePath = tempFilePath();
    const firstPlan = planRobotsAiPolicyFix(filePath);
    writeRobotsAiPolicyFix(filePath, firstPlan.updatedText!);

    const secondPlan = planRobotsAiPolicyFix(filePath);
    expect(secondPlan.applicable).toBe(false);
    expect(secondPlan.alreadyApplied).toBe(true);
  });

  it("전혀 다른(마커 없는) 기존 robots.ts는 applicable=false·alreadyApplied 없이 손대지 않는다", () => {
    const filePath = tempFilePath();
    const customContent = `import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/admin" } };
}
`;
    fs.writeFileSync(filePath, customContent);

    const plan = planRobotsAiPolicyFix(filePath);
    expect(plan.applicable).toBe(false);
    expect(plan.alreadyApplied).toBeUndefined();
    // 기존 파일은 절대 변경되지 않아야 한다(추측 금지·fail-closed 원칙)
    expect(fs.readFileSync(filePath, "utf-8")).toBe(customContent);
  });
});
