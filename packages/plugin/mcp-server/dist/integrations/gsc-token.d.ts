/**
 * GSC는 PSI(API 키 하나)와 달리 "어느 속성을 조회할지"도 알아야 REST 호출을 만들 수 있다. PRD
 * (`04_PROJECT_SPEC.md` 환경변수 표)는 `GSC_SERVICE_ACCOUNT_PATH`만 명시하고 속성 지정 변수를
 * 두지 않았다 — `Integration` DB 엔티티(`property_scope` 필드)가 이미 설계돼 있지만, 그걸 채워주는
 * 사용자 대면 경로(MCP 도구 인자·설정 UI 등)가 하나도 없다(2026-08-20 확인 — `insertIntegration`
 * 호출부가 테스트 밖에 전혀 없음). 지금 그 위에 새 입력 경로를 설계하기보다, PSI가 이미 증명한
 * "env-only, Integration DB를 거치지 않는" 패턴을 그대로 따르는 게 지금 규모에 맞다고 판단해
 * `GSC_PROPERTY_SCOPE`를 추가한다 — PRD 이탈이 아니라 PRD 자신이 못 채운 빈틈을 PRD의 기존 패턴으로
 * 메우는 것이다.
 *
 * 둘 중 하나만 있어도 비활성(null) 취급한다 — 서비스계정은 있는데 속성을 모르면 애초에 아무것도
 * 조회할 수 없고, 그 반대도 마찬가지라 "부분 설정"을 "설정 안 함"과 동일하게 다루는 게 안전하다
 * (추측으로 기본 속성을 만들어내지 않는다, fail-closed).
 */
export interface GscConfig {
    keyFilePath: string;
    propertyScope: string;
}
export declare function getGscConfig(): GscConfig | null;
