export declare class ForkNotReadyError extends Error {
}
/** GitHub 사용자명은 대소문자를 구분하지 않는다 — 단순 비교로는 "Octocat" vs "octocat"을 다르게 볼 수 있다. */
export declare function isOwnRepo(authenticatedLogin: string, repoOwner: string): boolean;
export interface WaitForForkReadyOptions {
    maxAttempts?: number;
    intervalMs?: number;
}
/**
 * GitHub의 fork 생성 API는 즉시 응답하지만 실제 저장소가 clone 가능해지기까지 비동기 지연이 있다
 * (Plan Mode 설계 검토에서 이미 지적된 위험 — "fork 스팸/폴링"). checkForkExists를 주입받아
 * 실제 GitHub 없이도 폴링·백오프 로직 자체를 검증할 수 있게 한다. 무한 재시도는 하지 않는다 —
 * 상한을 넘으면 "아직 준비 안 됨"을 사용자에게 정직하게 알려야 한다(크롤 max-pages와 같은 원칙).
 */
export declare function waitForForkReady(checkForkExists: () => Promise<boolean>, opts?: WaitForForkReadyOptions): Promise<void>;
