export class ForkNotReadyError extends Error {}

/** GitHub 사용자명은 대소문자를 구분하지 않는다 — 단순 비교로는 "Octocat" vs "octocat"을 다르게 볼 수 있다. */
export function isOwnRepo(authenticatedLogin: string, repoOwner: string): boolean {
  return authenticatedLogin.toLowerCase() === repoOwner.toLowerCase();
}

export interface WaitForForkReadyOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_INTERVAL_MS = 2000;

/**
 * GitHub의 fork 생성 API는 즉시 응답하지만 실제 저장소가 clone 가능해지기까지 비동기 지연이 있다
 * (Plan Mode 설계 검토에서 이미 지적된 위험 — "fork 스팸/폴링"). checkForkExists를 주입받아
 * 실제 GitHub 없이도 폴링·백오프 로직 자체를 검증할 수 있게 한다. 무한 재시도는 하지 않는다 —
 * 상한을 넘으면 "아직 준비 안 됨"을 사용자에게 정직하게 알려야 한다(크롤 max-pages와 같은 원칙).
 */
export async function waitForForkReady(
  checkForkExists: () => Promise<boolean>,
  opts: WaitForForkReadyOptions = {},
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await checkForkExists()) return;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new ForkNotReadyError(`fork가 ${maxAttempts}회 확인에도 준비되지 않았습니다(간격 ${intervalMs}ms)`);
}
