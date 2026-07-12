import path from "node:path";
import { checkGitClean, backupFiles, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { runNextBuildOnly } from "../render-bridge/server-launcher.js";
import { findApplicableFixesByAuditRun, markApplied, type FixWithFindingRecord } from "../db/repositories/fix.js";
import { updateFindingStatus } from "../db/repositories/finding.js";
import { planSitemapFix, writeSitemapFix } from "../fixers/sitemap-fixer.js";
import { planCanonicalFix, writeCanonicalFix } from "../fixers/canonical-fixer.js";
import { planOgFix, writeOgFix } from "../fixers/og-fixer.js";
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
export async function applyLocalFixes(db: SeomedicDb, projectRoot: string, auditRunId: number): Promise<AppliedFixOutcome[]> {
  const fixes = findApplicableFixesByAuditRun(db, auditRunId);
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
