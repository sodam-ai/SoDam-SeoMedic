import type { SeomedicDb } from "../connection.js";
export declare const MIGRATION_0003_GITHUB_PR = "\nCREATE TABLE IF NOT EXISTS github_pr (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  project_id INTEGER NOT NULL REFERENCES project (id),\n  repo_owner TEXT NOT NULL,\n  repo_name TEXT NOT NULL,\n  is_fork INTEGER NOT NULL,\n  branch_name TEXT NOT NULL,\n  pr_number INTEGER,\n  pr_url TEXT,\n  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed', 'merged')),\n  created_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_github_pr_repo ON github_pr (repo_owner, repo_name);\n";
/**
 * `ALTER TABLE ... ADD COLUMN`은 SQLite에 `IF NOT EXISTS`가 없어(MySQL/Postgres 전용 문법),
 * 0001/0002처럼 매번 db.exec()로 재실행하면 두 번째 오픈부터 "duplicate column name"으로 죽는다
 * (실제로 겪을 뻔한 버그 — connection.ts가 모든 마이그레이션을 매 open마다 재실행하는 구조라서 발견됨).
 * 그래서 이 컬럼만 PRAGMA table_info로 존재 여부를 먼저 확인한 뒤 조건부로 추가한다.
 */
export declare function ensureFixGithubPrColumn(db: SeomedicDb): void;
