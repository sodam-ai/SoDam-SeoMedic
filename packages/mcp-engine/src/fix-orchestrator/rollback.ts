import fs from "node:fs";
import path from "node:path";
import { findFixById, clearApplied } from "../db/repositories/fix.js";
import { updateFindingStatus } from "../db/repositories/finding.js";
import type { SeomedicDb } from "../db/connection.js";

export class FixRollbackError extends Error {}

export interface RollbackOutcome {
  fixId: number;
  targetPath: string | null;
  restored: boolean;
}

/**
 * 이미 적용된(applied_at 존재) fix를 apply 당시의 백업(backup_path)으로 되돌린다.
 * git checkout이 아니라 백업 파일을 쓰는 이유: apply 이후 시간이 지나 다른 커밋·수정이 쌓였을 수 있어
 * "git이 clean"이라는 apply 시점의 전제가 rollback 시점엔 더 이상 보장되지 않기 때문
 * (git-safety/git-guard.ts의 revertViaGitCheckout은 clean이 보장된 apply 실패 직후 롤백 전용).
 */
export async function rollbackLocalFix(db: SeomedicDb, projectRoot: string, fixId: number): Promise<RollbackOutcome> {
  const fix = findFixById(db, fixId);
  if (!fix) throw new FixRollbackError(`fix id=${fixId}를 찾을 수 없습니다`);
  if (!fix.applied_at) throw new FixRollbackError(`fix id=${fixId}는 적용된 적이 없어 되돌릴 수 없습니다`);
  if (!fix.target_path) throw new FixRollbackError(`fix id=${fixId}에 target_path가 없어 자동 롤백할 수 없습니다`);
  if (!fix.backup_path || !fs.existsSync(fix.backup_path)) {
    throw new FixRollbackError(`fix id=${fixId}의 백업이 없어 자동 롤백할 수 없습니다 — git으로 직접 되돌려주세요`);
  }

  const absTargetPath = path.join(projectRoot, fix.target_path);
  fs.copyFileSync(fix.backup_path, absTargetPath);

  clearApplied(db, fixId);
  updateFindingStatus(db, fix.finding_id, "reverted");

  return { fixId, targetPath: fix.target_path, restored: true };
}
