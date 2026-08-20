import { GoogleAuth } from "google-auth-library";

/**
 * GSC/GA4는 PSI(단순 API 키)와 달리 서비스계정 JWT→OAuth2 액세스 토큰 교환이 필요하다. JWT 서명·
 * 토큰 교환 로직은 손으로 짜지 않고 Google 공식 `google-auth-library`를 그대로 쓴다 — 이 프로젝트가
 * 이미 여러 번 택해 온 원칙과 같은 방향이다(예: `github/sandbox.ts`의 정리 재시도가 Node 공식
 * `fs.rm` 옵션을 그대로 쓰고 직접 재시도 루프를 짜지 않은 것과 동일 — 검증된 표준 메커니즘을
 * 재구현하지 않는다).
 *
 * keyFile은 항상 명시적으로 넘긴다 — 생략하면 GoogleAuth가 Application Default Credentials 탐색
 * 순서(env var → gcloud 설정 → **GCP 메타데이터 서버 169.254.169.254**)를 자동 시도할 수 있는데,
 * 169.254.169.254는 이 프로젝트의 SSRF 방어(M1, `crawler/ssrf-guard.ts`)가 우리 자신의 크롤러에서
 * 명시적으로 차단하는 바로 그 주소다. 로컬 개발 PC에서는 어차피 도달하지 않지만, "이 주소로 향하는
 * 요청을 자동으로 시도하지 않는다"는 프로젝트 전체의 일관된 원칙을 여기서도 지킨다(keyFile 필수 인자로
 * 자동탐색 경로 자체를 봉쇄).
 */
export class GoogleAuthTokenError extends Error {}

export type AccessTokenProvider = (keyFilePath: string, scopes: string[]) => Promise<string>;

/**
 * 실제 프로덕션 동작. 테스트는 이 함수를 쓰지 않고 canned 토큰 문자열을 반환하는 가짜
 * AccessTokenProvider를 주입한다(gsc-client.ts/ga4-client.ts의 DI 패턴, psi-client.ts의 PsiFetcher와
 * 동일한 방향) — 실제 서비스계정 파일 없이는 이 함수 자체를 결정적으로 테스트할 방법이 없기 때문에,
 * "키 파일 경로+scopes를 받아 토큰 문자열을 반환한다"는 계약(포트)만 테스트 대상으로 삼는다.
 */
export const defaultAccessTokenProvider: AccessTokenProvider = async (keyFilePath, scopes) => {
  let token: string | null | undefined;
  try {
    const auth = new GoogleAuth({ keyFile: keyFilePath, scopes });
    const client = await auth.getClient();
    ({ token } = await client.getAccessToken());
  } catch (err) {
    // 키 파일 "경로"는 시크릿이 아니라(파일시스템 위치일 뿐) 에러 메시지에 그대로 남겨도 M4 위반이
    // 아니다 — 시크릿(키 내용 자체)은 google-auth-library 내부에서만 다뤄지고 이 함수 밖으로 안 나온다.
    throw new GoogleAuthTokenError(`서비스계정 인증 실패(${keyFilePath}): ${(err as Error).message}`);
  }
  if (!token) {
    throw new GoogleAuthTokenError(`서비스계정 인증에 성공했지만 액세스 토큰을 받지 못했습니다(${keyFilePath})`);
  }
  return token;
};
