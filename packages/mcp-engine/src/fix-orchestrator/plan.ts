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
import { planCanonicalFix } from "../fixers/canonical-fixer.js";
import { planOgFix } from "../fixers/og-fixer.js";
import { planNoindexFix } from "../fixers/noindex-fixer.js";
import { planRobotsAiPolicyFix } from "../fixers/robots-ai-policy-fixer.js";
import { planJsonLdWebsiteFix } from "../fixers/jsonld-website-fixer.js";
import { planTitleFix } from "../fixers/title-fixer.js";
import { AI_CRAWLER_POLICY_RULE_ID, buildAiCrawlerPolicyViolation } from "../crawler/ai-crawler-finding.js";
import { findPageFilePath } from "./page-file-resolver.js";
import { scanLocalFix } from "./scan.js";
import type { SeomedicDb } from "../db/connection.js";
import type { RuleViolation } from "../rules/types.js";
import type { ScannedPage } from "./scan.js";
import type { AiCrawlerAccessReport } from "../crawler/ai-crawler-policy.js";

const LOGICAL_ORIGIN = "http://local.seomedic.internal";
const SITEMAP_RULE_ID = "R-SITEMAP-MISSING-URL";
const SITEMAP_RULE_VERSION = 1;
const SITEMAP_FILE_CANDIDATES = ["app/sitemap.ts", "app/sitemap.js", "src/app/sitemap.ts", "src/app/sitemap.js"];
const CANONICAL_RULE_ID = "R-CANONICAL-MISSING";
const CANONICAL_JS_ONLY_RULE_ID = "R-CANONICAL-JS-ONLY";
const OG_RULE_ID = "R-OG-BASIC-MISSING";
const NOINDEX_RULE_ID = "R-NOINDEX-DETECTED";
// page-file-resolver.ts APP_DIR_CANDIDATES와 동일 후보(App Router 루트 판정용) — robots.ts는 신규
// "생성" 대상이라 기존 파일을 찾는 게 아니라 어느 app 디렉터리에 만들지 결정해야 해서 별도로 둔다.
const ROBOTS_APP_DIR_CANDIDATES = ["app", "src/app"];
const ROBOTS_LAYOUT_EXTENSIONS = ["tsx", "jsx", "js"];
const JSONLD_WEBSITE_RULE_ID = "R-JSONLD-WEBSITE-MISSING";
const JSONLD_WEBSITE_RULE_VERSION = 1;
// robots.ts와 동일한 후보 목록이지만 대상이 "만들 위치"가 아니라 "이미 있는 layout 파일 자체"라
// 별도 상수로 둔다(og-fixer.ts가 canonical-fixer.ts 로직을 의도적으로 복제한 것과 같은 이유).
const ROOT_LAYOUT_DIR_CANDIDATES = ["app", "src/app"];
const ROOT_LAYOUT_EXTENSIONS = ["tsx", "jsx", "js"];
const TITLE_RULE_ID = "R-TITLE-MISSING";

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

  // JSON-LD도 sitemap·AI크롤러정책과 같은 "사이트 전체" 개념이다(페이지별 R-JSONLD-MISSING과 다름 —
  // 그 규칙은 여전히 페이지마다 독립 평가됨, 여기서 건드리지 않는다). 크롤된 200 페이지가 **전부**
  // R-JSONLD-MISSING이면(즉 어디에도 JSON-LD가 전혀 없으면) 사이트 전체 부재로 보고 fixer 대상
  // finding을 하나만 만든다. 단 한 페이지라도 이미 JSON-LD가 있으면(수동으로 일부 넣어뒀을 수 있음)
  // 안전하게 건너뛴다 — 사용자의 기존 의도적 작업과 충돌하지 않기 위한 보수적 트리거.
  const okPages = scanResult.pages.filter((p) => p.statusCode === 200);
  const allPagesMissingJsonLd = okPages.length > 0 && okPages.every((p) => p.violations.some((v) => v.ruleId === "R-JSONLD-MISSING"));
  if (allPagesMissingJsonLd) {
    allViolations.push({
      ruleId: JSONLD_WEBSITE_RULE_ID,
      ruleVersion: JSONLD_WEBSITE_RULE_VERSION,
      category: "schema",
      severity: "low", // 기존 R-JSONLD-MISSING과 동일 판단 — 부재는 "결함"이 아니라 "기회"라 낮은 심각도
      pageUrl: `${LOGICAL_ORIGIN}/`,
      currentValue: null,
      recommendedValue: `사이트 전체 페이지 ${okPages.length}개 모두 구조화 데이터(JSON-LD) 없음 — 루트 레이아웃에 기본 WebSite 스키마 추가 권장`,
    });
  }

  if (scanResult.aiCrawlerAccess) {
    // ai-crawler-finding.ts와 동일하게 origin은 LOGICAL_ORIGIN 고정값을 쓴다 — 실제 로컬 서버 origin은
    // 실행마다 포트가 바뀌어, 그걸 그대로 쓰면 finding_key(hash(page_url+rule_id+rule_version))가 매번
    // 달라져 회귀 비교가 절대 안 맞는다(위 sitemap 처리와 동일 이유).
    allViolations.push(buildAiCrawlerPolicyViolation(LOGICAL_ORIGIN, scanResult.aiCrawlerAccess));
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

    if (finding.rule_id === CANONICAL_RULE_ID) {
      const fix = planCanonicalFixForFinding(db, projectRoot, finding);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === CANONICAL_JS_ONLY_RULE_ID) {
      const fix = planJsOnlyCanonicalFixForFinding(db, projectRoot, finding, scanResult.pages);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === OG_RULE_ID) {
      const fix = planOgFixForFinding(db, projectRoot, finding, scanResult.pages);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === NOINDEX_RULE_ID) {
      const fix = planNoindexFixForFinding(db, projectRoot, finding);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === AI_CRAWLER_POLICY_RULE_ID) {
      const fix = planAiCrawlerPolicyFixForFinding(db, projectRoot, finding, scanResult.aiCrawlerAccess);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === JSONLD_WEBSITE_RULE_ID) {
      const fix = planJsonLdWebsiteFixForFinding(db, projectRoot, finding, scanResult.pages);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

    if (finding.rule_id === TITLE_RULE_ID) {
      const fix = planTitleFixForFinding(db, projectRoot, finding, scanResult.pages);
      if (fix) plannedFixes.push({ fix, finding });
      else reportOnlyFindings.push(finding);
      continue;
    }

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

/**
 * canonical은 04_PROJECT_SPEC "예외 없음" 결정에 따라 순수 "추가"여도 항상 gated·pending으로 넣는다
 * (sitemap의 add_safe·auto와 다른 지점 — 여기서만 예외적으로 승인 후 apply가 실제로 반영한다).
 * canonical 값은 finding.page_url(placeholder origin 기반)의 pathname만 쓴다 — 실제 배포 도메인이
 * 파이프라인 어디에도 없고, Next.js가 metadataBase 기준 상대경로 해석을 공식 지원하기 때문
 * (Plan Mode 확정 결정).
 */
function planCanonicalFixForFinding(db: SeomedicDb, projectRoot: string, finding: FindingRecord): FixRecord | null {
  const pathname = new URL(finding.page_url).pathname;

  const pageRelPath = findPageFilePath(projectRoot, pathname);
  if (!pageRelPath) return null; // 정적 페이지 파일을 못 찾음(동적 라우트 등) — report_only로 남김

  const absPath = path.join(projectRoot, pageRelPath);
  const plan = planCanonicalFix(absPath, pathname);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${pageRelPath}\n+ alternates.canonical: ${JSON.stringify(pathname)}`,
    targetPath: pageRelPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(alternates.canonical 상대경로 추가)",
    idempotencyMarker: pathname,
  });
}

/**
 * R-CANONICAL-MISSING과 달리 이 rule은 JS가 **이미 계산해 렌더링한** canonical 값이 있을 때만 발생한다
 * (raw HTML엔 없고 rendered DOM엔 있음 — canonical.ts의 canonicalJsOnlyRule 조건). 그 값은 반드시
 * 그대로 보존해 raw HTML/소스로 이전해야 하며, planCanonicalFixForFinding처럼 페이지 자기 경로로
 * 자기참조 값을 새로 계산해서는 안 된다 — JS가 계산한 canonical이 의도적으로 다른 경로를 가리킬 수
 * 있기 때문(예: 페이지네이션 2페이지가 1페이지를 canonical로 지정하는 경우). 자기참조를 가정하면 이런
 * 의도적인 비자기참조 canonical을 조용히 깨뜨릴 위험이 있다(Plan Mode 확정 결정).
 */
export function planJsOnlyCanonicalFixForFinding(
  db: SeomedicDb,
  projectRoot: string,
  finding: FindingRecord,
  pages: ScannedPage[],
): FixRecord | null {
  const page = pages.find((p) => p.logicalUrl === finding.page_url);
  if (!page) return null; // 이 스캔에서 나온 finding이 아님 — 방어적 fail-closed(있어선 안 되는 상황)

  if (!page.renderedCanonical) return null; // 규칙이 발생했다면 있어야 하나, 절대 값을 추측하지 않는다(fail-closed)

  const pathname = new URL(finding.page_url).pathname;

  const pageRelPath = findPageFilePath(projectRoot, pathname);
  if (!pageRelPath) return null; // 정적 페이지 파일을 못 찾음(동적 라우트 등) — report_only로 남김

  const absPath = path.join(projectRoot, pageRelPath);
  const plan = planCanonicalFix(absPath, page.renderedCanonical);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${pageRelPath}\n+ alternates.canonical: ${JSON.stringify(page.renderedCanonical)}(JS 계산값 보존)`,
    targetPath: pageRelPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(JS가 이미 계산한 canonical 값을 raw HTML/소스로 이전)",
    idempotencyMarker: page.renderedCanonical,
  });
}

/**
 * og:title/og:url 소스 값은 finding.page_url만으로 못 구한다(canonical fixer와 달리 페이지 자기
 * 경로에서 재구성할 수 없는 실제 콘텐츠 값이라) — planJsOnlyCanonicalFixForFinding과 동일 이유로
 * scanResult.pages에서 렌더된 실제 값을 가져와야 한다. 둘 다 이미 검증된 같은 페이지 값의 복사이며
 * 새로 계산·창작하지 않는다.
 */
function planOgFixForFinding(
  db: SeomedicDb,
  projectRoot: string,
  finding: FindingRecord,
  pages: ScannedPage[],
): FixRecord | null {
  const page = pages.find((p) => p.logicalUrl === finding.page_url);
  if (!page) return null; // 방어적 fail-closed(있어선 안 되는 상황)

  const ogTitle = page.renderedTitle;
  const ogUrl = page.renderedCanonical;
  if (!ogTitle && !ogUrl) return null; // 복사할 값이 전혀 없음 — report_only로 남김

  const pathname = new URL(finding.page_url).pathname;
  const pageRelPath = findPageFilePath(projectRoot, pathname);
  if (!pageRelPath) return null; // 정적 페이지 파일을 못 찾음(동적 라우트 등) — report_only로 남김

  const absPath = path.join(projectRoot, pageRelPath);
  const plan = planOgFix(absPath, ogTitle, ogUrl);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  const diffLines = plan.added!.map((a) => `+ openGraph.${a.field}: ${JSON.stringify(a.value)}`).join("\n");
  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${pageRelPath}\n${diffLines}`,
    targetPath: pageRelPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(openGraph.title·url 추가)",
    idempotencyMarker: JSON.stringify({ title: ogTitle, url: ogUrl }),
  });
}

/**
 * noindex 값은 canonical과 달리 finding.page_url에서 재계산하지 않는다 — 이미 소스에 박혀 있는
 * boolean 리터럴(false)을 true로 교정할 뿐이라 planNoindexFix(filePath)만으로 충분하다(추가 파라미터
 * 불필요, robots-ai-policy-fixer.ts의 무파라미터 plan과 동일한 성격).
 */
function planNoindexFixForFinding(db: SeomedicDb, projectRoot: string, finding: FindingRecord): FixRecord | null {
  const pathname = new URL(finding.page_url).pathname;

  const pageRelPath = findPageFilePath(projectRoot, pathname);
  if (!pageRelPath) return null; // 정적 페이지 파일을 못 찾음(동적 라우트 등) — report_only로 남김

  const absPath = path.join(projectRoot, pageRelPath);
  const plan = planNoindexFix(absPath);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${pageRelPath}\n- robots.index: false\n+ robots.index: true`,
    targetPath: pageRelPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(robots.index를 false에서 true로 교정)",
    idempotencyMarker: null,
  });
}

/**
 * App Router 루트(app/ 또는 src/app/)를 layout 파일 존재로 판정해 robots.ts를 만들 위치를 정한다.
 * (page-file-resolver.ts의 APP_DIR_CANDIDATES·next-detect/detect-nextjs.ts의 appRouterMarkers와
 * 동일한 판정 방식을 여기서만 다시 쓴다 — og-fixer.ts가 canonical-fixer.ts 로직을 의도적으로 복제한
 * 것과 같은 이유: 기존 Phase 1.5 완료 코드를 이번 작업 범위에서 건드리지 않기 위함.)
 * 둘 다 없으면(App Router 루트를 못 찾음) null — 생성 대상 아님(report_only로 폴백).
 */
function resolveRobotsTargetPath(projectRoot: string): string | null {
  for (const dir of ROBOTS_APP_DIR_CANDIDATES) {
    const hasLayout = ROBOTS_LAYOUT_EXTENSIONS.some((ext) => fs.existsSync(path.join(projectRoot, dir, `layout.${ext}`)));
    if (hasLayout) return path.join(dir, "robots.ts");
  }
  return null;
}

/**
 * sitemap/canonical/og와 달리 "이미 있는 파일을 편집"이 아니라 "없을 때만 새로 만든다" — robots.ts가
 * 이미 존재하면(report.robotsTxtFound=true) 우리가 만든 것이든 아니든 절대 재구성하지 않는다
 * (robots-ai-policy-fixer.ts의 fail-closed 설계 그대로 따름).
 */
function planAiCrawlerPolicyFixForFinding(
  db: SeomedicDb,
  projectRoot: string,
  finding: FindingRecord,
  report: AiCrawlerAccessReport | null,
): FixRecord | null {
  if (!report || report.robotsTxtFound) return null; // 이미 robots.txt가 있음(또는 조회 실패) — report_only

  const targetPath = resolveRobotsTargetPath(projectRoot);
  if (!targetPath) return null; // App Router 루트를 못 찾음 — report_only

  const absPath = path.join(projectRoot, targetPath);
  const plan = planRobotsAiPolicyFix(absPath);
  if (!plan.applicable) return null; // 그 사이 파일이 생겼거나(경합) 이미 우리가 만든 파일 — report_only(멱등은 apply 시점에 재확인)

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `새 파일: ${targetPath}\n+ AI 크롤러 정책 — 검색엔진/AI 검색봇 허용, AI 학습 전용 크롤러(GPTBot·ClaudeBot 등) 차단`,
    targetPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(robots.ts 신규 생성)",
    idempotencyMarker: null,
  });
}

/** App Router 루트(app/ 또는 src/app/)의 layout 파일 자체를 찾는다(robots.ts처럼 "만들 위치"가 아니라
 * "이미 있는 파일" — 존재하지 않으면 App Router 프로젝트가 아니라는 뜻이라 애초에 planLocalFix
 * 시작 단계의 detectNextjs에서 걸러졌을 상황이지만, 방어적으로 null 처리한다). */
function resolveRootLayoutPath(projectRoot: string): string | null {
  for (const dir of ROOT_LAYOUT_DIR_CANDIDATES) {
    for (const ext of ROOT_LAYOUT_EXTENSIONS) {
      const candidate = path.join(dir, `layout.${ext}`);
      if (fs.existsSync(path.join(projectRoot, candidate))) return candidate;
    }
  }
  return null;
}

/**
 * siteName은 크롤된 페이지 중 **홈페이지(경로가 정확히 "/")**의 렌더된 title을 그대로 복사한다
 * (og-fixer.ts와 동일 원칙 — 새로 계산·창작하지 않음). 홈페이지를 못 찾으면(사이트모드가 아니라
 * 단일 페이지만 스캔했는데 그 페이지가 "/"가 아닌 경우 등) 첫 번째 크롤 페이지로 폴백한다 — 어느
 * 쪽이든 "실제로 렌더된 값"이라는 성질은 동일하게 유지된다.
 */
function planJsonLdWebsiteFixForFinding(
  db: SeomedicDb,
  projectRoot: string,
  finding: FindingRecord,
  pages: ScannedPage[],
): FixRecord | null {
  const targetPath = resolveRootLayoutPath(projectRoot);
  if (!targetPath) return null; // App Router 루트를 못 찾음 — report_only

  const homePage = pages.find((p) => {
    try {
      return new URL(p.logicalUrl).pathname === "/";
    } catch {
      return false;
    }
  });
  const entryPage = homePage ?? pages[0];
  if (!entryPage) return null; // 크롤된 페이지 자체가 없음(있을 수 없는 방어적 상황) — report_only

  const siteName = entryPage.renderedTitle;
  if (!siteName) return null; // 복사할 값이 없음 — report_only(값 발명 금지, og-fixer.ts와 동일 원칙)

  const absPath = path.join(projectRoot, targetPath);
  const plan = planJsonLdWebsiteFix(absPath, siteName);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${targetPath}\n+ WebSite JSON-LD(name: ${JSON.stringify(siteName)})`,
    targetPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(루트 레이아웃에 WebSite JSON-LD 추가)",
    idempotencyMarker: siteName,
  });
}

/**
 * title 소스 값은 og-fixer.ts와 동일 이유로 finding.page_url만으로 못 구한다 — scanResult.pages에서
 * 렌더된 실제 h1 텍스트를 가져와 그대로 복사한다(새로 계산·창작하지 않음).
 */
function planTitleFixForFinding(db: SeomedicDb, projectRoot: string, finding: FindingRecord, pages: ScannedPage[]): FixRecord | null {
  const page = pages.find((p) => p.logicalUrl === finding.page_url);
  if (!page) return null; // 방어적 fail-closed(있어선 안 되는 상황)

  const h1Title = page.renderedH1Text;
  if (!h1Title) return null; // 복사할 값이 없음 — report_only로 남김

  const pathname = new URL(finding.page_url).pathname;
  const pageRelPath = findPageFilePath(projectRoot, pathname);
  if (!pageRelPath) return null; // 정적 페이지 파일을 못 찾음(동적 라우트 등) — report_only로 남김

  const absPath = path.join(projectRoot, pageRelPath);
  const plan = planTitleFix(absPath, h1Title);
  if (!plan.applicable || plan.updatedText === plan.originalText) return null;

  return insertFix(db, {
    findingId: finding.id,
    fixType: "file_edit",
    riskLevel: "gated",
    approvalStatus: "pending",
    dryRunDiff: `파일: ${pageRelPath}\n+ title: ${JSON.stringify(h1Title)}(같은 페이지 h1 텍스트 복사)`,
    targetPath: pageRelPath,
    validation: "승인 후 next build 재검증을 통과해야 적용됩니다(title을 h1 텍스트로 채움)",
    idempotencyMarker: h1Title,
  });
}
