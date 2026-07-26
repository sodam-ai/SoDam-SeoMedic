import { findOpenGithubPrByBranch } from "../db/repositories/github-pr.js";
/**
 * DB만 믿지 않는다 — 사용자가 SeoMedic 밖에서(GitHub 웹 UI로) PR을 직접 닫거나 병합했을 수 있어,
 * DB 기록과 실제 GitHub 상태가 어긋날 수 있다(Plan Mode 설계에서 지적된 위험: "API 이중 확인").
 * listOpenPrBranches를 주입받아 실제 GitHub 없이도 교차확인 로직 자체를 검증할 수 있게 한다.
 */
export async function checkDuplicatePr(db, repoOwner, repoName, branchName, listOpenPrBranches) {
    const dbRecord = findOpenGithubPrByBranch(db, repoOwner, repoName, branchName);
    if (dbRecord) {
        return { isDuplicate: true, reason: `DB에 이미 열린 PR 기록이 있습니다(branch=${branchName})` };
    }
    const liveOpenBranches = await listOpenPrBranches();
    if (liveOpenBranches.includes(branchName)) {
        return {
            isDuplicate: true,
            reason: `GitHub에 이미 같은 브랜치(${branchName})로 열린 PR이 있습니다(DB 기록과 무관하게 실시간 확인됨)`,
        };
    }
    return { isDuplicate: false, reason: null };
}
//# sourceMappingURL=duplicate-guard.js.map