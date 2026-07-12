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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-migration-0004-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("0004_integration 마이그레이션", () => {
  it("integration 테이블이 실제로 생성된다", () => {
    const db = openSeomedicDb(makeTempProject());

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='integration'`).all();
    expect(tables).toHaveLength(1);

    const columns = db.prepare(`PRAGMA table_info(integration)`).all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toEqual(
      expect.arrayContaining(["id", "project_id", "type", "auth_method", "credential_env_ref", "property_scope"]),
    );

    db.close();
  });

  it("CREATE TABLE IF NOT EXISTS라 같은 DB 파일을 여러 번 열어도 안전하다(0001/0002와 동일 성격)", () => {
    const projectRoot = makeTempProject();

    const db1 = openSeomedicDb(projectRoot);
    db1.close();

    expect(() => {
      const db2 = openSeomedicDb(projectRoot);
      db2.close();
    }).not.toThrow();

    const db3 = openSeomedicDb(projectRoot);
    const tables = db3.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='integration'`).all();
    expect(tables).toHaveLength(1); // 중복 테이블 생성 안 됨
    db3.close();
  });
});
