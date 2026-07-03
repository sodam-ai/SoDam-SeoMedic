import type { SeomedicDb } from "../connection.js";

export type GithubPrState = "open" | "closed" | "merged";

export interface GithubPrRecord {
  id: number;
  project_id: number;
  repo_owner: string;
  repo_name: string;
  is_fork: number;
  branch_name: string;
  pr_number: number | null;
  pr_url: string | null;
  state: GithubPrState;
  created_at: string;
}

export interface InsertGithubPrInput {
  projectId: number;
  repoOwner: string;
  repoName: string;
  isFork: boolean;
  branchName: string;
  prNumber?: number | null;
  prUrl?: string | null;
}

export function insertGithubPr(db: SeomedicDb, input: InsertGithubPrInput): GithubPrRecord {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO github_pr (project_id, repo_owner, repo_name, is_fork, branch_name, pr_number, pr_url, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .run(
      input.projectId,
      input.repoOwner,
      input.repoName,
      input.isFork ? 1 : 0,
      input.branchName,
      input.prNumber ?? null,
      input.prUrl ?? null,
      now,
    );
  return findGithubPrById(db, Number(result.lastInsertRowid))!;
}

export function findGithubPrById(db: SeomedicDb, id: number): GithubPrRecord | undefined {
  return db.prepare(`SELECT * FROM github_pr WHERE id = ?`).get(id) as GithubPrRecord | undefined;
}

/**
 * duplicate-guard.ts의 DB 쪽 확인 — 같은 저장소·같은 브랜치명으로 이미 열려있는(open) PR 기록이
 * 있는지 조회한다. 브랜치명이 fix마다 결정론적으로 생성돼야(pr-builder.ts) 이 조회가 의미가 있다
 * (매번 랜덤 브랜치명이면 중복 판정 자체가 불가능해짐 — 설계 검토에서 확인).
 */
export function findOpenGithubPrByBranch(
  db: SeomedicDb,
  repoOwner: string,
  repoName: string,
  branchName: string,
): GithubPrRecord | undefined {
  return db
    .prepare(`SELECT * FROM github_pr WHERE repo_owner = ? AND repo_name = ? AND branch_name = ? AND state = 'open'`)
    .get(repoOwner, repoName, branchName) as GithubPrRecord | undefined;
}

export function setGithubPrState(db: SeomedicDb, id: number, state: GithubPrState): void {
  db.prepare(`UPDATE github_pr SET state = ? WHERE id = ?`).run(state, id);
}
