export interface RepoRef {
    owner: string;
    repo: string;
}
export declare class InvalidRepoUrlError extends Error {
}
/**
 * `https://github.com/owner/repo`, `https://github.com/owner/repo.git`, `github.com/owner/repo`,
 * `owner/repo` 형태를 전부 받는다. github.com이 아닌 호스트(사설 GHE 등)는 지금 범위 밖이라 명시 거부한다
 * (조용히 잘못 파싱하는 것보다 fail-closed가 안전 — M5 입력 불신 검증 원칙과 동일).
 */
export declare function parseRepoUrl(input: string): RepoRef;
