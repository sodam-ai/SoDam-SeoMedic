import fs from "node:fs";
import path from "node:path";
import { checkGitClean, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { detectNextjs } from "../next-detect/detect-nextjs.js";
import { launchLocalNextServer } from "../render-bridge/server-launcher.js";
import { setRenderSource, startAuditRun, finishAuditRun, findAuditRunById } from "../db/repositories/audit-run.js";
import { findOrCreateProject } from "../db/repositories/project.js";
import { createPage } from "../db/repositories/page.js";
import { insertFindings, findFindingsByAuditRun, type FindingRecord } from "../db/repositories/finding.js";
import { insertFix, type FixRecord } from "../db/repositories/fix.js";
import { findFixerDescriptor } from "../fixers/registry.js";
import { planSitemapFix } from "../fixers/sitemap-fixer.js";
import { scanLocalFix } from "./scan.js";
import type { SeomedicDb } from "../db/connection.js";
import type { RuleViolation } from "../rules/types.js";

const LOGICAL_ORIGIN = "http://local.seomedic.internal";
const SITEMAP_RULE_ID = "R-SITEMAP-MISSING-URL";
const SITEMAP_RULE_VERSION = 1;
const SITEMAP_FILE_CANDIDATES = ["app/sitemap.ts", "app/sitemap.js", "src/app/sitemap.ts", "src/app/sitemap.js"];

export class FixPlanBlockedError extends Error {
  constructor(
    public readonly reason: "dirty" | "git_not_found" | "not_a_repo" | "not_nextjs",
    message: string,
  ) {
    super(message);
    this.name = "FixPlanBlockedError";
  }
}

export interface PlannedFix {
  fix: FixRecord;
  finding: FindingRecord;
}

export interface FixPlanResult {
  projectId: number;
  auditRunId: number;
  findings: FindingRecord[];
  plannedFixes: PlannedFix[];
  reportOnlyFindings: FindingRecord[]; // fixer가 없거나(report_only) applicable=false인 Finding
  truncated: boolean;
}

function findSitemapFilePath(projectRoot: string): string | null {
  for (const candidate of SITEMAP_FILE_CANDIDATES) {
    if (fs.existsSync(path.join(projectRoot, candidate))) return candidate;
  }
  return null;
}

export interface PlanLocalFixOptions {
  /**
   * Project.target에 쓸 값을 projectRoot 대신 지정한다(기본값=projectRoot, 1.5a 동작 그대로 유지).
   * GitHub 모드 전용 — sandbox clone 경로는 실행마다 새로 생기는 임시 경로라, 그걸 그대로 target으로
   * 쓰면 findOrCreateProject가 매번 새 Project를 만들어버려 회귀 이력이 절대 안 쌓인다(설계 검토 중
   * 발견 — repo-cache-path.ts로 DB 파일 자체는 영속화했지만, project.target 값이 여전히 휘발성이면
   * 같은 DB 안에서도 매번 다른 프로젝트로 취급되는 두 번째 층의 문제였음). GitHub 오케스트레이터는
   * `owner/repo` 같은 안정적인 문자열을 넘긴다.
   */
  projectTargetOverride?: string;
}

/**
 * git-clean 확인 → Next.js 감지 → 로컬 서버 기동 → 크롤+렌더+규칙평가(scanLocalFix) →
 * Finding 저장 → fixer가 있는 Finding에 한해 dry-run Fix 생성. 서버는 스캔이 끝나면 항상 종료한다.
 *
 * git dirty면 아예 시작하지 않는다(백업 없이 진행 금지 — PRD "절대 하지 마" 원칙과 동일,
 * 플랜 단계는 아직 아무 파일도 안 건드리지만 dirty 상태에서 진행해봤자 apply 때 다시 막히므로
 * 사용자에게 조기에 알리는 게 낫다는 판단).
 */
export async function planLocalFix(
  db: SeomedicDb,
  projectRoot: string,
  options: PlanLocalFixOptions = {},
): Promise<FixPlanResult> {
  const gitStatus = await checkGitClean(projectRoot);
  if (!gitStatus.clean) {
    throw new FixPlanBlockedError(
      gitStatus.reason,
      `git 상태가 clean이 아니라 fix를 진행할 수 없습니다(${gitStatus.reason}): ${gitStatus.details}`,
    );
  }

  const detection = detectNextjs(projectRoot);
  if (!detection.isNextjs) {
    throw new FixPlanBlockedError("not_nextjs", `Next.js 프로젝트가 아닙니다: ${detection.reason}`);
  }

  const project = findOrCreateProject(db, {
    target: options.projectTargetOverride ?? projectRoot,
    mode: "analyze-fix",
    sourceAvailable: true,
    detectedStack: `nextjs@${detection.version ?? "unknown"}(${detection.router})`,
  });
  const auditRun = startAuditRun(db, project.id, "technical");

  const server = await launchLocalNextServer({ projectRoot });
  let scanResult;
  try {
    setRenderSource(db, auditRun.id, server.origin);
    scanResult = await scanLocalFix(server.origin);
  } finally {
    await server.stop(); // 스캔 성공/실패와 무관하게 로컬 서버는 항상 정리한다(S5 원칙)
  }

  // next build가 package.json/package-lock.json 등을 자체적으로 정규화해 쓰는 경우가 실제로 있다
  // (실측 확인됨 — Next.js가 누락된 타입 패키지 감지 시 조용히 갱신). plan은 git 상태를 건드리지
  // 않아야 하는 단계인데(dry-run), 이걸 그대로 두면 뒤이은 apply의 git-clean 재확인이 "우리 자신의
  // 빌드 부산물" 때문에 dirty로 오판해 거부된다 — plan 시작 시 clean이었다는 걸 이미 확인했으므로,
  // 여기서 dirty가 감지되면 빌드가 만든 부산물뿐이라는 뜻이라 안전하게 되돌린다.
  const postBuildStatus = await checkGitClean(projectRoot);
  if (!postBuildStatus.clean && postBuildStatus.reason === "dirty") {
    await revertViaGitCheckout(projectRoot, ["."]);
  }

  for (const page of scanResult.pages) {
    createPage(db, {
      auditRunId: auditRun.id,
      url: page.logicalUrl,
      statusCode: page.statusCode,
      rawHasContent: page.rawHtml.length > 0,
      rawHtml: page.rawHtml,
    });
  }

  const allViolations: RuleViolation[] = [...scanResult.allViolations];
  const hasSitemapGap = scanResult.sitemap.missingUrls.length > 0 || scanResult.sitemap.skippedPaths.length > 0;
  if (hasSitemapGap) {
    const missingList = [...scanResult.sitemap.missingUrls, ...scanResult.sitemap.skippedPaths];
    allViolations.push({
      ruleId: SITEMAP_RULE_ID,
      ruleVersion: SITEMAP_RULE_VERSION,
      category: "indexing",
      severity: "medium",
      pageUrl: `${LOGICAL_ORIGIN}/sitemap.xml`,
      currentValue: null,
      recommendedValue: `누락 ${missingList.length}건: ${missingList.join(", ")}`,
    });
  }

  insertFindings(db, auditRun.id, allViolations);
  finishAuditRun(db, auditRun.id, null);
  // finishAuditRun은 UPDATE만 하므로 auditRun 변수를 그대로 안 쓰고 재조회한다
  // (Phase 1 audit-orchestrator.ts에서 이미 한 번 실제로 겪은 버그와 동일 유형 — 여기서도 방지).
  findAuditRunById(db, auditRun.id);

  const findings = findFindingsByAuditRun(db, auditRun.id);
  const plannedFixes: PlannedFix[] = [];
  const reportOnlyFindings: FindingRecord[] = [];

  for (const finding of findings) {
    const descriptor = findFixerDescriptor(finding.rule_id);
    if (!descriptor) {
      reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === SITEMAP_RULE_ID) {
      const fix = planSitemapFixForFinding(db, projectRoot, finding, scanResult.sitemap.missingUrls);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    // 지금은 sitemap fixer 하나뿐이라 이 분기는 도달하지 않지만, 향후 fixer 추가 시
    // registry에는 있는데 여기 분기가 없는 실수를 조용히 넘기지 않기 위해 report_only로 명시 폴백.
    reportOnlyFindings.push(finding);
  }

  return {
    projectId: project.id,
    auditRunId: auditRun.id,
    findings,
    plannedFixes,
    reportOnlyFindings,
    truncated: scanResult.truncated,
  };
}

function planSitemapFixForFinding(
  db: SeomedicDb,
  projectRoot: string,
  finding: FindingRecord,
  missingUrls: string[],
): FixRecord | null {
  if (missingUrls.length === 0) return null; // origin 추론 불가(sitemap 비어있음) 등 — report_only로 남김

  const sitemapRelPath = findSitemapFilePath(projectRoot);
  if (!sitemapRelPath) return null; // sitemap.ts 자체가 없음 — 자동수정 대상 아님

  const absPath = path.join(projectRoot, sitemapRelPath);
  const plan = planSitemapFix(absPath, missingUrls);
  if (!plan.applicable || plan.urlsToAdd!.length === 0) return null;

  const diff = plan.urlsToAdd!.map((u) => `+ { url: ${JSON.stringify(u)} }`).join("\n");
  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "add_safe",
    approvalStatus: "auto",
    dryRunDiff: `파일: ${sitemapRelPath}\n${diff}`,
    targetPath: sitemapRelPath,
    validation: `크롤 시 200 응답 확인된 페이지 ${plan.urlsToAdd!.length}건`,
    idempotencyMarker: JSON.stringify(plan.urlsToAdd),
  });
}
