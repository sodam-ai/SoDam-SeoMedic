export declare class SandboxError extends Error {
}
/**
 * 서버 기동 시 1회 호출 — 이전 실행이 비정상 종료(강제 kill 등)해 signal 핸들러조차 못 돌고 남은
 * sandbox 잔해를 정리한다(계획 단계의 "3중 정리: finally/signal handler/기동시 GC" 중 마지막 층).
 * 1시간 미만인 디렉터리는 건드리지 않는다 — 동시에 다른 프로세스가 실제로 쓰고 있을 수 있어서다.
 */
export declare function gcOrphanedSandboxes(): void;
export interface SandboxHandle {
    path: string;
    cleanup(): Promise<void>;
}
export interface CreateSandboxOptions {
    /** 실제 clone에 쓸 URL. 토큰은 여기 절대 포함하지 않는다(별도 GIT_ASKPASS 경로로 주입 — token.ts). */
    cloneUrl: string;
    maxRepoSizeKb?: number;
    /** GitHub API로 저장소 크기(KB)를 미리 확인하는 함수(주입식 — 실제 네트워크 호출은 호출부 책임).
     *  생략하면 크기 확인 없이 진행(호출부가 이미 확인했다는 뜻으로 취급). */
    fetchRepoSizeKb?: () => Promise<number | null>;
    cloneTimeoutMs?: number;
    /** GIT_ASKPASS 등 clone에 필요한 추가 환경변수(token.ts가 채움). */
    env?: NodeJS.ProcessEnv;
}
/**
 * 얕은 clone(`--depth 1`)만 한다 — 계획 단계엔 없던 결정. 오래되거나 큰 저장소를 전체 히스토리로
 * clone하면 시간·디스크를 과하게 쓴다(Phase 1의 max-pages·depth 제한과 같은 원칙을 GitHub 모드에도 적용).
 * clone 전 저장소 크기를 먼저 확인해(주입된 함수로) 상한 초과 시 아예 시도하지 않는다.
 */
export declare function createSandboxClone(opts: CreateSandboxOptions): Promise<SandboxHandle>;
