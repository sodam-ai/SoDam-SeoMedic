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
export declare function insertGithubPr(db: SeomedicDb, input: InsertGithubPrInput): GithubPrRecord;
export declare function findGithubPrById(db: SeomedicDb, id: number): GithubPrRecord | undefined;
/**
 * duplicate-guard.ts의 DB 쪽 확인 — 같은 저장소·같은 브랜치명으로 이미 열려있는(open) PR 기록이
 * 있는지 조회한다. 브랜치명이 fix마다 결정론적으로 생성돼야(pr-builder.ts) 이 조회가 의미가 있다
 * (매번 랜덤 브랜치명이면 중복 판정 자체가 불가능해짐 — 설계 검토에서 확인).
 */
export declare function findOpenGithubPrByBranch(db: SeomedicDb, repoOwner: string, repoName: string, branchName: string): GithubPrRecord | undefined;
export declare function setGithubPrState(db: SeomedicDb, id: number, state: GithubPrState): void;
