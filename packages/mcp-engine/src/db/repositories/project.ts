import type { SeomedicDb } from "../connection.js";

export interface ProjectRecord {
  id: number;
  target: string;
  mode: "analyze" | "analyze-fix";
  source_available: number;
  detected_stack: string | null;
  local_server_cmd: string | null;
  created_at: string;
}

export interface CreateProjectInput {
  target: string;
  mode: "analyze" | "analyze-fix";
  sourceAvailable: boolean;
  detectedStack?: string | null;
  localServerCmd?: string | null;
}

/** 모든 쿼리는 파라미터 바인딩만 사용한다(문자열 결합 절대 금지 — 보안 M8). */
export function createProject(db: SeomedicDb, input: CreateProjectInput): ProjectRecord {
  const stmt = db.prepare(
    `INSERT INTO project (target, mode, source_available, detected_stack, local_server_cmd, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  const result = stmt.run(
    input.target,
    input.mode,
    input.sourceAvailable ? 1 : 0,
    input.detectedStack ?? null,
    input.localServerCmd ?? null,
    now,
  );
  return findProjectById(db, Number(result.lastInsertRowid))!;
}

export function findProjectById(db: SeomedicDb, id: number): ProjectRecord | undefined {
  return db.prepare(`SELECT * FROM project WHERE id = ?`).get(id) as ProjectRecord | undefined;
}

export function findProjectByTarget(db: SeomedicDb, target: string): ProjectRecord | undefined {
  return db.prepare(`SELECT * FROM project WHERE target = ? ORDER BY id DESC LIMIT 1`).get(target) as
    | ProjectRecord
    | undefined;
}

/** target(진단 대상)이 이미 있으면 그 프로젝트를 재사용하고, 없으면 새로 만든다(중복 프로젝트 방지). */
export function findOrCreateProject(db: SeomedicDb, input: CreateProjectInput): ProjectRecord {
  return findProjectByTarget(db, input.target) ?? createProject(db, input);
}
