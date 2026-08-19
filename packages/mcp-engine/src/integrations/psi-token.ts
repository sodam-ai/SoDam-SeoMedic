const PSI_API_KEY_ENV_VAR = "PAGESPEED_API_KEY";

/**
 * PSI(PageSpeed Insights)는 공개 API라 서비스계정이 필요 없다 — credential-loader.ts(Integration DB
 * 엔티티 전용, GSC/GA4의 서비스계정 파일 "경로"만 다루도록 설계됨)를 억지로 재사용하지 않고
 * github/token.ts와 동일한 "env-only 바로 읽기" 패턴을 그대로 적용한다(DB 스키마 변경 불필요 —
 * PSI는 프로젝트별 소유권 개념이 없어 Integration 엔티티의 property_scope 불변식과 애초에 안 맞음).
 *
 * github/token.ts의 getGithubToken()과의 차이: PSI는 선택 기능이다(키가 없어도 audit은 CrUX 섹션만
 * 빠진 채 정상 진행) — 그래서 예외를 던지지 않고 null을 반환해 호출부가 조용히 건너뛸 수 있게 한다.
 */
export function getPsiApiKey(): string | null {
  const key = process.env[PSI_API_KEY_ENV_VAR];
  if (!key || key.trim().length === 0) return null;
  return key;
}
