import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSeomedicDb } from "../../src/db/connection.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-migration-0003-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("0003_github_pr 마이그레이션 — ALTER TABLE 재실행 안전성", () => {
  it("같은 DB 파일을 여러 번 열어도(재시작 시나리오) duplicate column 에러 없이 정상 동작한다", () => {
    const projectRoot = makeTempProject();

    const db1 = openSeomedicDb(projectRoot); // 최초 오픈 — CREATE TABLE + ALTER TABLE 실행
    db1.close();

    // 두 번째 오픈 — ALTER TABLE을 그대로 다시 실행하면 "duplicate column name: github_pr_id"로 죽는다
    // (SQLite ALTER TABLE ADD COLUMN엔 IF NOT EXISTS가 없음 — 실제로 겪을 뻔한 버그).
    expect(() => {
      const db2 = openSeomedicDb(projectRoot);
      db2.close();
    }).not.toThrow();

    // 세 번째 오픈도 안전한지(멱등성이 우연이 아님을 확인)
    const db3 = openSeomedicDb(projectRoot);
    const columns = db3.prepare(`PRAGMA table_info(fix)`).all() as Array<{ name: string }>;
    expect(columns.filter((c) => c.name === "github_pr_id")).toHaveLength(1); // 중복 컬럼 생성 안 됨
    db3.close();
  });

  it("github_pr 테이블이 실제로 생성되고 fix.github_pr_id 컬럼으로 참조 가능하다", () => {
    const projectRoot = makeTempProject();
    const db = openSeomedicDb(projectRoot);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='github_pr'`).all();
    expect(tables).toHaveLength(1);

    const columns = db.prepare(`PRAGMA table_info(fix)`).all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toContain("github_pr_id");

    db.close();
  });
});
