import type { GithubApiClient } from "./api-client-port.js";
/**
 * ⚠️ 부분 검증됨 — 읽기 전용 메서드는 실제 GitHub 공개 저장소(octocat/Hello-World, 토큰 없이)로
 * 응답 형태를 직접 확인했다: `repos.get`의 archived/disabled/license/size/default_branch/fork,
 * `repos.getCommunityProfileMetrics`의 files.license/files.contributing, `pulls.list`의
 * head.ref 전부 이 파일이 가정한 형태와 실제로 일치함을 확인(1회성 프로브 스크립트로 검증 후 삭제).
 *
 * 여전히 미검증(쓰기 작업 — 토큰과 실제 실행 동의 없이는 검증 불가):
 * - `getAuthenticatedLogin`(인증 필요)
 * - `createFork`의 반환 형태(포크된 저장소의 owner.login/name 위치) — fork는 실제 저장소를 만드는
 *   되돌리기 어려운 부작용이라 아직 실행하지 않음
 * - `createPullRequest` — 실제 PR을 만드는 되돌리기 어려운 부작용이라 아직 실행하지 않음
 */
export declare function createOctokitGithubClient(token: string): GithubApiClient;
