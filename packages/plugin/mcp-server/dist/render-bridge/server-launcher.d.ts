export declare class RenderBridgeError extends Error {
    constructor(message: string);
}
export interface LaunchedLocalServer {
    origin: string;
    port: number;
    stop(): Promise<void>;
}
export interface LaunchOptions {
    projectRoot: string;
    /** "build-start"(기본) = next build 성공 후 next start. "dev" = next dev(빌드 없이 즉시 기동). */
    command?: "build-start" | "dev";
    buildTimeoutMs?: number;
    startHealthTimeoutMs?: number;
}
/**
 * 폴더 → next build(신뢰불가 스크립트 경유 없이 바이너리 직접) → next start(127.0.0.1 고정 바인딩)
 * → 헬스체크 → { origin, port, stop() }. 실패 시 프로세스 정리 후 RenderBridgeError.
 */
export declare function launchLocalNextServer(opts: LaunchOptions): Promise<LaunchedLocalServer>;
/**
 * 서버를 띄우지 않고 `next build`만 실행한다(apply 후 재검증 전용).
 * launchLocalNextServer는 항상 포트 확보+start+헬스체크까지 하므로, "빌드만 다시 통과하는지" 확인하려는
 * apply 경로에 그대로 재사용하면 불필요한 서버 기동·헬스체크 실패 지점이 추가된다(설계 검토에서 확인).
 * 성공 시 정상 반환, 실패 시 RenderBridgeError를 던진다(성공/실패는 예외 여부로만 판단 — 값 반환 없음).
 */
export declare function runNextBuildOnly(projectRoot: string, buildTimeoutMs?: number): Promise<void>;
