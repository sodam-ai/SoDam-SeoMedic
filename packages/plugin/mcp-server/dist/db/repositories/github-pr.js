export function insertGithubPr(db, input) {
    const now = new Date().toISOString();
    const result = db
        .prepare(`INSERT INTO github_pr (project_id, repo_owner, repo_name, is_fork, branch_name, pr_number, pr_url, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
        .run(input.projectId, input.repoOwner, input.repoName, input.isFork ? 1 : 0, input.branchName, input.prNumber ?? null, input.prUrl ?? null, now);
    return findGithubPrById(db, Number(result.lastInsertRowid));
}
export function findGithubPrById(db, id) {
    return db.prepare(`SELECT * FROM github_pr WHERE id = ?`).get(id);
}
/**
 * duplicate-guard.ts의 DB 쪽 확인 — 같은 저장소·같은 브랜치명으로 이미 열려있는(open) PR 기록이
 * 있는지 조회한다. 브랜치명이 fix마다 결정론적으로 생성돼야(pr-builder.ts) 이 조회가 의미가 있다
 * (매번 랜덤 브랜치명이면 중복 판정 자체가 불가능해짐 — 설계 검토에서 확인).
 */
export function findOpenGithubPrByBranch(db, repoOwner, repoName, branchName) {
    return db
        .prepare(`SELECT * FROM github_pr WHERE repo_owner = ? AND repo_name = ? AND branch_name = ? AND state = 'open'`)
        .get(repoOwner, repoName, branchName);
}
export function setGithubPrState(db, id, state) {
    db.prepare(`UPDATE github_pr SET state = ? WHERE id = ?`).run(state, id);
}
//# sourceMappingURL=github-pr.js.map