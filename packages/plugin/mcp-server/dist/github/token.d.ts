export declare class GithubTokenError extends Error {
}
/**
 * 토큰은 env에서만 읽는다(DO-NOT: "GitHub 토큰은 최소 권한(env-only, 로그 금지)"). 이 함수는
 * 절대 토큰 값 자체를 에러 메시지에 포함하지 않는다 — 없다는 사실만 알린다.
 */
export declare function getGithubToken(): string;
export interface AskpassScript {
    scriptPath: string;
    env: NodeJS.ProcessEnv;
    cleanup(): void;
}
/**
 * ⚠️ 미검증 — 실제 GitHub 인증으로 아직 검증되지 않았다(테스트용 토큰이 있어야 증명 가능).
 * git이 HTTPS 인증 시 GIT_ASKPASS로 지정된 프로그램을 "Username for '...'" / "Password for '...'"
 * 프롬프트와 함께 호출한다는 git 공식 동작에 기반해 작성했다. 토큰을 URL에 절대 임베드하지 않는
 * 이유는 .git/config나 프로세스 인자 목록(ps 등)에 노출될 수 있어서다(DO-NOT 원칙).
 *
 * 토큰 값 자체는 스크립트 파일에 직접 쓰지 않고 별도 env var로 전달한다 — 스크립트 파일이 실수로
 * 로그·백업에 남아도 토큰이 함께 유출되지 않게 하기 위함(심층 방어).
 */
export declare function createAskpassScript(token: string): AskpassScript;
