import Database from "better-sqlite3";
import { resolveSeomedicDbPath } from "./path-guard.js";
import { MIGRATION_0001_INIT } from "./migrations/0001_init.js";
import { MIGRATION_0002_FIX } from "./migrations/0002_fix.js";
import { MIGRATION_0003_GITHUB_PR, ensureFixGithubPrColumn } from "./migrations/0003_github_pr.js";

export type SeomedicDb = Database.Database;

/**
 * projectRoot 아래 `.seomedic/seomedic.db`를 열고(없으면 생성) 스키마를 적용한다.
 * WAL 모드 + foreign_keys on. 이 함수가 반환하는 DB 핸들에 대한 모든 쿼리는
 * repositories/*.ts를 통해서만 나가야 하며, 전부 파라미터 바인딩을 써야 한다(보안 M8).
 */
export function openSeomedicDb(projectRoot: string): SeomedicDb {
  const dbPath = resolveSeomedicDbPath(projectRoot);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATION_0001_INIT);
  db.exec(MIGRATION_0002_FIX);
  db.exec(MIGRATION_0003_GITHUB_PR);
  ensureFixGithubPrColumn(db);
  return db;
}
