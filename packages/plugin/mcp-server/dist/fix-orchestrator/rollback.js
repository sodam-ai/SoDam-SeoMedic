import fs from "node:fs";
import path from "node:path";
import { findFixById, clearApplied } from "../db/repositories/fix.js";
import { findFindingById, updateFindingStatus } from "../db/repositories/finding.js";
import { AI_CRAWLER_POLICY_RULE_ID } from "../crawler/ai-crawler-finding.js";
export class FixRollbackError extends Error {
}
/**
 * 이미 적용된(applied_at 존재) fix를 apply 당시의 백업(backup_path)으로 되돌린다.
 * git checkout이 아니라 백업 파일을 쓰는 이유: apply 이후 시간이 지나 다른 커밋·수정이 쌓였을 수 있어
 * "git이 clean"이라는 apply 시점의 전제가 rollback 시점엔 더 이상 보장되지 않기 때문
 * (git-safety/git-guard.ts의 revertViaGitCheckout은 clean이 보장된 apply 실패 직후 롤백 전용).
 */
export async function rollbackLocalFix(db, projectRoot, fixId) {
    const fix = findFixById(db, fixId);
    if (!fix)
        throw new FixRollbackError(`fix id=${fixId}를 찾을 수 없습니다`);
    if (!fix.applied_at)
        throw new FixRollbackError(`fix id=${fixId}는 적용된 적이 없어 되돌릴 수 없습니다`);
    if (!fix.target_path)
        throw new FixRollbackError(`fix id=${fixId}에 target_path가 없어 자동 롤백할 수 없습니다`);
    // R-AI-CRAWLER-POLICY는 "신규 파일 생성" fix라 backup_path가 정상적으로 null이다(백업할 원본 자체가
    // 없었음 — apply.ts applyAiCrawlerPolicyFix 참고). 되돌리기 = 우리가 만든 파일을 지우는 것. 다른
    // fixer는 전부 "기존 파일 수정"이라 backup_path가 항상 있어야 정상이므로, 이 분기는 rule_id로 엄격히
    // 좁혀 다른 fixer의 기존 동작(백업 없으면 실패)을 전혀 건드리지 않는다. FixRecord 자체엔 rule_id가
    // 없어(fix 테이블 단독 조회) finding을 별도로 찾아 확인한다.
    if (!fix.backup_path) {
        const finding = findFindingById(db, fix.finding_id);
        if (finding?.rule_id === AI_CRAWLER_POLICY_RULE_ID) {
            fs.rmSync(path.join(projectRoot, fix.target_path), { force: true });
            clearApplied(db, fixId);
            updateFindingStatus(db, fix.finding_id, "reverted");
            return { fixId, targetPath: fix.target_path, restored: true };
        }
    }
    if (!fix.backup_path || !fs.existsSync(fix.backup_path)) {
        throw new FixRollbackError(`fix id=${fixId}의 백업이 없어 자동 롤백할 수 없습니다 — git으로 직접 되돌려주세요`);
    }
    const absTargetPath = path.join(projectRoot, fix.target_path);
    fs.copyFileSync(fix.backup_path, absTargetPath);
    clearApplied(db, fixId);
    updateFindingStatus(db, fix.finding_id, "reverted");
    return { fixId, targetPath: fix.target_path, restored: true };
}
//# sourceMappingURL=rollback.js.map