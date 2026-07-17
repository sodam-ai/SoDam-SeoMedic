// Phase 1.5b(GitHub 저장소 모드) 스키마. 0001/0002는 무수정 — 신규 마이그레이션으로 분리.
// github_pr은 PRD 02_DATA_MODEL.md에 별도 엔티티로 명시돼 있지 않다(설계 시점 결정) — Fix.fix_type='pr'과
// 짝을 이루는 최소 필드만 담는다: 어느 저장소·브랜치에 PR을 냈는지, 중복 PR 방지에 필요한 조회 키.
export const MIGRATION_0003_GITHUB_PR = `
CREATE TABLE IF NOT EXISTS github_pr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  is_fork INTEGER NOT NULL,
  branch_name TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed', 'merged')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_pr_repo ON github_pr (repo_owner, repo_name);
`;
/**
 * `ALTER TABLE ... ADD COLUMN`은 SQLite에 `IF NOT EXISTS`가 없어(MySQL/Postgres 전용 문법),
 * 0001/0002처럼 매번 db.exec()로 재실행하면 두 번째 오픈부터 "duplicate column name"으로 죽는다
 * (실제로 겪을 뻔한 버그 — connection.ts가 모든 마이그레이션을 매 open마다 재실행하는 구조라서 발견됨).
 * 그래서 이 컬럼만 PRAGMA table_info로 존재 여부를 먼저 확인한 뒤 조건부로 추가한다.
 */
export function ensureFixGithubPrColumn(db) {
    const columns = db.prepare(`PRAGMA table_info(fix)`).all();
    const hasColumn = columns.some((c) => c.name === "github_pr_id");
    if (!hasColumn) {
        db.exec(`ALTER TABLE fix ADD COLUMN github_pr_id INTEGER REFERENCES github_pr (id)`);
    }
}
//# sourceMappingURL=0003_github_pr.js.map