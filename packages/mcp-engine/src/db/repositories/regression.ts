import type { SeomedicDb } from "../connection.js";

export type RegressionClassification = Record<string, "regression" | "intended">;

export interface RegressionRecord {
  id: number;
  project_id: number;
  baseline_id: number;
  reverted_keys: string; // JSON string array
  classification: string; // JSON RegressionClassification
  detected_at: string;
}

/** 분류 로직(regression vs intended 판정) 자체는 M6 classify.ts의 책임 — 여기는 결과 저장만 담당. */
export function createRegressionRecord(
  db: SeomedicDb,
  projectId: number,
  baselineId: number,
  revertedKeys: string[],
  classification: RegressionClassification,
): RegressionRecord {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO regression (project_id, baseline_id, reverted_keys, classification, detected_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(projectId, baselineId, JSON.stringify(revertedKeys), JSON.stringify(classification), now);
  return findRegressionById(db, Number(result.lastInsertRowid))!;
}

export function findRegressionById(db: SeomedicDb, id: number): RegressionRecord | undefined {
  return db.prepare(`SELECT * FROM regression WHERE id = ?`).get(id) as RegressionRecord | undefined;
}

export function findRegressionsByProject(db: SeomedicDb, projectId: number): RegressionRecord[] {
  return db.prepare(`SELECT * FROM regression WHERE project_id = ? ORDER BY id DESC`).all(projectId) as RegressionRecord[];
}
