import fs from "node:fs";
import path from "node:path";
import { checkGitClean, backupFiles, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { runNextBuildOnly } from "../render-bridge/server-launcher.js";
import { findApplicableFixesByAuditRun, markApplied, type FixWithFindingRecord } from "../db/repositories/fix.js";
import { updateFindingStatus } from "../db/repositories/finding.js";
import { planSitemapFix, writeSitemapFix } from "../fixers/sitemap-fixer.js";
import { planCanonicalFix, writeCanonicalFix } from "../fixers/canonical-fixer.js";
import { planOgFix, writeOgFix } from "../fixers/og-fixer.js";
import { planNoindexFix, writeNoindexFix } from "../fixers/noindex-fixer.js";
import { planRobotsAiPolicyFix, writeRobotsAiPolicyFix } from "../fixers/robots-ai-policy-fixer.js";
import { AI_CRAWLER_POLICY_RULE_ID } from "../crawler/ai-crawler-finding.js";
import type { SeomedicDb } from "../db/connection.js";

export class FixApplyBlockedError extends Error {
  constructor(
    public readonly reason: "dirty" | "git_not_found" | "not_a_repo",
    message: string,
  ) {
    super(message);
    this.name = "FixApplyBlockedError";
  }
}

export type AppliedFixOutcomeKind = "applied" | "already_applied" | "build_failed" | "structure_changed";

export interface AppliedFixOutcome {
  fixId: number;
  targetPath: string | null;
  outcome: AppliedFixOutcomeKind;
  detail: string;
}

export interface ApplyLocalFixesOptions {
  /**
   * 지정하면 이 id 목록에 있는 fix만 적용한다(auto/approved라도 목록 밖이면 건너뜀).
   *
   * ⚠️ 2026-08-20 추가 — GitHub PR 모드가 위험도별로 두 PR(safe/review)을 독립된 sandbox에서 각각
   * 만들도록 재설계되며 발견된 실제 버그 때문에 필요해졌다: review bucket도 매번 완전히 새로 clone해
   * 자기만의 planLocalFix를 새로 돌리는데, 그 결과 원본 저장소에 실재하는 add_safe 문제(예: sitemap
   * 누락)가 review bucket의 plan에도 독립적으로 다시 잡히고, 그 fix는 approval_status='auto'로
   * 무조건 즉시 적용 대상이 된다 — review bucket은 gated만 담아야 하는데 add_safe까지 같이 커밋에
   * 섞여 들어가는 오염이 실제로 재현됐다(테스트로 발견). 로컬 모드(auditRunId 하나에 속한 전부를
   * 적용하는 게 정확히 의도된 동작)는 이 옵션을 안 쓰면 기존과 완전히 동일하게 동작한다.
   */
  onlyFixIds?: number[];
}

/**
 * plan 단계에서 만든 fix 중 auto/approved·미적용인 것만 실제로 파일에 반영한다.
 * fix마다 순차로: 멱등성 재확인(TOCTOU) → 백업 → 파일 쓰기 → `next build`만 재실행 →
 * 실패 시 git checkout으로 이 파일만 즉시 롤백. 하나가 실패해도 나머지 fix는 계속 시도한다
 * (서로 다른 파일을 건드릴 수 있어 한 실패가 전체를 막을 이유가 없음).
 *
 * git-clean 재확인은 "실제로 쓸 파일이 있을 때만" 한다 — findApplicableFixesByAuditRun이 이미
 * applied_at IS NULL만 걸러주므로, 재실행 시 적용 대상이 0건이면 아무것도 안 쓸 텐데 그때도
 * git-clean을 요구하면 "직전 apply가 남긴 리뷰 대기 중인 변경"만으로 재실행(멱등 확인) 자체가
 * 막혀버린다(실제로 재현된 버그 — PRD의 "fix 2회 실행해도 멱등" 요구사항과 충돌했었음).
 */
export async function applyLocalFixes(
  db: SeomedicDb,
  projectRoot: string,
  auditRunId: number,
  options: ApplyLocalFixesOptions = {},
): Promise<AppliedFixOutcome[]> {
  let fixes = findApplicableFixesByAuditRun(db, auditRunId);
  if (options.onlyFixIds) {
    const allow = new Set(options.onlyFixIds);
    fixes = fixes.filter((f) => allow.has(f.id));
  }
  if (fixes.length === 0) return [];

  const gitStatus = await checkGitClean(projectRoot);
  if (!gitStatus.clean) {
    throw new FixApplyBlockedError(
      gitStatus.reason,
      `git 상태가 clean이 아니라 적용할 수 없습니다(${gitStatus.reason}): ${gitStatus.details}`,
    );
  }

  const outcomes: AppliedFixOutcome[] = [];
  for (const fix of fixes) {
    outcomes.push(await applyOneFix(db, projectRoot, fix));
  }
  return outcomes;
}

/**
 * fix.rule_id로 실제 적용 로직을 분기한다. 등록만 되고(fixers/registry.ts) 여기 분기가 없는 실수를
 * 조용히 넘기지 않기 위해, 처리되지 않은 rule_id는 명시적으로 structure_changed(실패)로 보고한다.
 */
async function applyOneFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  if (!fix.target_path) {
    return { fixId: fix.id, targetPath: null, outcome: "structure_changed", detail: "target_path가 없는 fix는 자동 적용 대상이 아닙니다" };
  }

  if (fix.rule_id === "R-SITEMAP-MISSING-URL") {
    return applySitemapFix(db, projectRoot, fix);
  }
  if (fix.rule_id === "R-CANONICAL-MISSING" || fix.rule_id === "R-CANONICAL-JS-ONLY") {
    // applyCanonicalFix는 rule_id-무관 제네릭 함수(idempotency_marker를 그대로 canonical 값으로 씀) —
    // MISSING은 자기 경로를, JS-ONLY는 보존된 JS 계산값을 idempotency_marker에 담아 여기로 넘길 뿐이라
    // 별도 함수가 필요 없다(중복 구현 방지).
    return applyCanonicalFix(db, projectRoot, fix);
  }
  if (fix.rule_id === "R-OG-BASIC-MISSING") {
    return applyOgFix(db, projectRoot, fix);
  }
  if (fix.rule_id === "R-NOINDEX-DETECTED") {
    return applyNoindexFix(db, projectRoot, fix);
  }
  if (fix.rule_id === AI_CRAWLER_POLICY_RULE_ID) {
    return applyAiCrawlerPolicyFix(db, projectRoot, fix);
  }

  return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: "적용 로직이 구현되지 않은 rule_id입니다" };
}

async function applySitemapFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  const absPath = path.join(projectRoot, fix.target_path!);
  const missingUrls: string[] = JSON.parse(fix.idempotency_marker ?? "[]");

  // apply 직전 재검증(TOCTOU + 멱등성) — plan 이후 파일 구조가 바뀌었을 수 있다.
  const recheck = planSitemapFix(absPath, missingUrls);
  if (!recheck.applicable) {
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: recheck.reason };
  }
  if (recheck.urlsToAdd!.length === 0) {
    // 이미 반영돼 있음(재실행·수동 반영 등) — 멱등: 실패가 아니라 성공으로 간주
    markApplied(db, fix.id, new Date().toISOString(), fix.backup_path);
    updateFindingStatus(db, fix.finding_id, "fixed");
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "already_applied", detail: "이미 적용되어 있습니다(멱등)" };
  }

  const backupManifest = backupFiles(projectRoot, [fix.target_path!], `fix-${fix.id}`);
  const backupPath = backupManifest[0]?.backupPath ?? null;

  writeSitemapFix(absPath, recheck.updatedText!);

  try {
    await runNextBuildOnly(projectRoot);
  } catch (err) {
    await revertViaGitCheckout(projectRoot, [fix.target_path!]); // git이 apply 시작 시점에 clean이었으므로 이 checkout=fix 이전 상태로 완전 복원
    return {
      fixId: fix.id,
      targetPath: fix.target_path,
      outcome: "build_failed",
      detail: `적용 후 build 실패로 롤백됨: ${(err as Error).message}`,
    };
  }

  markApplied(db, fix.id, new Date().toISOString(), backupPath);
  updateFindingStatus(db, fix.finding_id, "fixed");
  return {
    fixId: fix.id,
    targetPath: fix.target_path,
    outcome: "applied",
    detail: `URL ${recheck.urlsToAdd!.length}건 추가 후 build 통과`,
  };
}

/** applySitemapFix와 완전히 동일한 스켈레톤(백업→쓰기→build 재검증→실패시 롤백) — 재검증 대상만 다르다. */
async function applyCanonicalFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  const absPath = path.join(projectRoot, fix.target_path!);
  const canonicalPath = fix.idempotency_marker ?? "/";

  // apply 직전 재검증(TOCTOU + 멱등성) — plan 이후 파일 구조가 바뀌었을 수 있다.
  const recheck = planCanonicalFix(absPath, canonicalPath);
  if (!recheck.applicable) {
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: recheck.reason };
  }
  if (recheck.updatedText === recheck.originalText) {
    // 이미 반영돼 있음(재실행·수동 반영 등) — 멱등: 실패가 아니라 성공으로 간주
    markApplied(db, fix.id, new Date().toISOString(), fix.backup_path);
    updateFindingStatus(db, fix.finding_id, "fixed");
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "already_applied", detail: "이미 적용되어 있습니다(멱등)" };
  }

  const backupManifest = backupFiles(projectRoot, [fix.target_path!], `fix-${fix.id}`);
  const backupPath = backupManifest[0]?.backupPath ?? null;

  writeCanonicalFix(absPath, recheck.updatedText!);

  try {
    await runNextBuildOnly(projectRoot);
  } catch (err) {
    await revertViaGitCheckout(projectRoot, [fix.target_path!]);
    return {
      fixId: fix.id,
      targetPath: fix.target_path,
      outcome: "build_failed",
      detail: `적용 후 build 실패로 롤백됨: ${(err as Error).message}`,
    };
  }

  markApplied(db, fix.id, new Date().toISOString(), backupPath);
  updateFindingStatus(db, fix.finding_id, "fixed");
  return {
    fixId: fix.id,
    targetPath: fix.target_path,
    outcome: "applied",
    detail: `alternates.canonical="${canonicalPath}" 추가 후 build 통과`,
  };
}

/** applyCanonicalFix와 완전히 동일한 스켈레톤(백업→쓰기→build 재검증→실패시 롤백) — 재검증 대상만 og. */
async function applyOgFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  const absPath = path.join(projectRoot, fix.target_path!);
  const marker = JSON.parse(fix.idempotency_marker ?? "{}") as { title?: string | null; url?: string | null };

  // apply 직전 재검증(TOCTOU + 멱등성) — plan 이후 파일 구조가 바뀌었을 수 있다.
  const recheck = planOgFix(absPath, marker.title ?? null, marker.url ?? null);
  if (!recheck.applicable) {
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: recheck.reason };
  }
  if (recheck.updatedText === recheck.originalText) {
    // 이미 반영돼 있음(재실행·수동 반영 등) — 멱등: 실패가 아니라 성공으로 간주
    markApplied(db, fix.id, new Date().toISOString(), fix.backup_path);
    updateFindingStatus(db, fix.finding_id, "fixed");
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "already_applied", detail: "이미 적용되어 있습니다(멱등)" };
  }

  const backupManifest = backupFiles(projectRoot, [fix.target_path!], `fix-${fix.id}`);
  const backupPath = backupManifest[0]?.backupPath ?? null;

  writeOgFix(absPath, recheck.updatedText!);

  try {
    await runNextBuildOnly(projectRoot);
  } catch (err) {
    await revertViaGitCheckout(projectRoot, [fix.target_path!]);
    return {
      fixId: fix.id,
      targetPath: fix.target_path,
      outcome: "build_failed",
      detail: `적용 후 build 실패로 롤백됨: ${(err as Error).message}`,
    };
  }

  markApplied(db, fix.id, new Date().toISOString(), backupPath);
  updateFindingStatus(db, fix.finding_id, "fixed");
  const fields = recheck.added!.map((a) => `openGraph.${a.field}`).join(", ");
  return {
    fixId: fix.id,
    targetPath: fix.target_path,
    outcome: "applied",
    detail: `${fields} 추가 후 build 통과`,
  };
}

/** applyCanonicalFix와 완전히 동일한 스켈레톤(백업→쓰기→build 재검증→실패시 롤백) — recheck에 추가
 * 파라미터가 필요 없다(canonical의 pathname·og의 title/url과 달리, false→true 교정은 파일 안에서
 * 이미 확정된 값만 본다). */
async function applyNoindexFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  const absPath = path.join(projectRoot, fix.target_path!);

  // apply 직전 재검증(TOCTOU + 멱등성) — plan 이후 파일 구조가 바뀌었을 수 있다.
  const recheck = planNoindexFix(absPath);
  if (!recheck.applicable) {
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: recheck.reason };
  }
  if (recheck.updatedText === recheck.originalText) {
    // 이미 반영돼 있음(재실행·수동 반영 등) — 멱등: 실패가 아니라 성공으로 간주
    markApplied(db, fix.id, new Date().toISOString(), fix.backup_path);
    updateFindingStatus(db, fix.finding_id, "fixed");
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "already_applied", detail: "이미 적용되어 있습니다(멱등)" };
  }

  const backupManifest = backupFiles(projectRoot, [fix.target_path!], `fix-${fix.id}`);
  const backupPath = backupManifest[0]?.backupPath ?? null;

  writeNoindexFix(absPath, recheck.updatedText!);

  try {
    await runNextBuildOnly(projectRoot);
  } catch (err) {
    await revertViaGitCheckout(projectRoot, [fix.target_path!]);
    return {
      fixId: fix.id,
      targetPath: fix.target_path,
      outcome: "build_failed",
      detail: `적용 후 build 실패로 롤백됨: ${(err as Error).message}`,
    };
  }

  markApplied(db, fix.id, new Date().toISOString(), backupPath);
  updateFindingStatus(db, fix.finding_id, "fixed");
  return {
    fixId: fix.id,
    targetPath: fix.target_path,
    outcome: "applied",
    detail: "robots.index를 false에서 true로 교정 후 build 통과",
  };
}

/**
 * 다른 네 applyXFix와 스켈레톤이 다르다 — 저것들은 "기존 파일 수정"이라 backupFiles가 항상 원본을
 * 백업하고, 실패 시 revertViaGitCheckout(git이 알고 있는 파일이라 체크아웃 가능)으로 되돌린다.
 * 이 fix는 "신규 파일 생성"이라 백업할 원본이 없고(backupFiles가 존재하지 않는 파일은 스킵함,
 * git-guard.ts 참고), git에 전혀 알려지지 않은 파일이라 git checkout으로 되돌릴 수 없다(untracked
 * pathspec 오류) — 실패 시 직접 fs.rmSync로 지운다.
 */
async function applyAiCrawlerPolicyFix(db: SeomedicDb, projectRoot: string, fix: FixWithFindingRecord): Promise<AppliedFixOutcome> {
  const absPath = path.join(projectRoot, fix.target_path!);

  // apply 직전 재검증(TOCTOU + 멱등성) — plan 이후 파일이 생겼을 수 있다.
  const recheck = planRobotsAiPolicyFix(absPath);
  if (!recheck.applicable) {
    if (recheck.alreadyApplied) {
      markApplied(db, fix.id, new Date().toISOString(), fix.backup_path);
      updateFindingStatus(db, fix.finding_id, "fixed");
      return { fixId: fix.id, targetPath: fix.target_path, outcome: "already_applied", detail: "이미 적용되어 있습니다(멱등)" };
    }
    return { fixId: fix.id, targetPath: fix.target_path, outcome: "structure_changed", detail: recheck.reason };
  }

  const backupManifest = backupFiles(projectRoot, [fix.target_path!], `fix-${fix.id}`);
  const backupPath = backupManifest[0]?.backupPath ?? null; // 신규 파일이라 항상 null(백업할 원본 없음)

  writeRobotsAiPolicyFix(absPath, recheck.updatedText!);

  try {
    await runNextBuildOnly(projectRoot);
  } catch (err) {
    fs.rmSync(absPath, { force: true }); // git checkout 불가(untracked) — 직접 제거
    return {
      fixId: fix.id,
      targetPath: fix.target_path,
      outcome: "build_failed",
      detail: `적용 후 build 실패로 롤백됨: ${(err as Error).message}`,
    };
  }

  markApplied(db, fix.id, new Date().toISOString(), backupPath);
  updateFindingStatus(db, fix.finding_id, "fixed");
  return {
    fixId: fix.id,
    targetPath: fix.target_path,
    outcome: "applied",
    detail: "AI 크롤러 정책 robots.ts 신규 생성 후 build 통과",
  };
}
