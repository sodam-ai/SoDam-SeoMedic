import type { RepoRef } from "./types.js";

export interface RepoMeta {
  isArchived: boolean;
  isDisabled: boolean;
  hasLicense: boolean;
  hasContributing: boolean;
  sizeKb: number;
  defaultBranch: string;
}

export interface CreatedPullRequest {
  number: number;
  url: string;
}

/**
 * GitHub API 실호출부(옥토킷 기반 api-client.ts)의 인터페이스만 먼저 정의한다. orchestrator.ts는
 * 이 인터페이스에만 의존해 작성·테스트하고, 실제 구현(api-client.ts)은 실제 GitHub 토큰/저장소로
 * 검증하기 전까지 만들지 않는다 — fork·PR 생성처럼 되돌리기 어려운 외부 부작용이 있는 코드라서다.
 * 테스트는 이 인터페이스의 가짜(fake) 구현을 주입해 오케스트레이션 로직만 검증한다.
 */
export interface GithubApiClient {
  getAuthenticatedLogin(): Promise<string>;
  getRepoMeta(ref: RepoRef): Promise<RepoMeta>;
  /**
   * 실제 구현은 `https://github.com/<owner>/<repo>.git`을 반환한다. 이 메서드로 분리한 이유:
   * orchestrator.ts가 clone URL을 직접 하드코딩하면 테스트가 실제 GitHub 없이는 불가능해진다 —
   * 가짜 client는 로컬 bare 저장소 경로를 반환해 오케스트레이션 전체를 오프라인으로 검증할 수 있다.
   */
  getCloneUrl(ref: RepoRef): string;
  forkExists(ref: RepoRef, forkOwner: string): Promise<boolean>;
  createFork(ref: RepoRef): Promise<RepoRef>;
  listOpenPrBranches(ref: RepoRef): Promise<string[]>;
  createPullRequest(
    ref: RepoRef,
    opts: { title: string; body: string; headBranch: string; headOwner: string; baseBranch: string },
  ): Promise<CreatedPullRequest>;
}
