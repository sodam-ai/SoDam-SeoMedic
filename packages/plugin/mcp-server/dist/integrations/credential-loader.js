/**
 * GSC/GA4/PSI 서비스계정 자격증명은 파일 "경로"만 env var로 참조한다(02_DATA_MODEL.md Integration
 * 엔티티 결정 — "자격증명은 저장 안 하고 환경변수 경로만 참조"). github/token.ts와 동일한 원칙을
 * 그대로 따른다: 값을 인자로 직접 받지 않고 env에서만 읽으며, 없으면 어떤 env var가 없는지만 알리고
 * 실제 값은 절대 에러 메시지에 담지 않는다(S2 "토큰 평문 저장 금지"와 같은 방향의 fail-closed 설계).
 *
 * 이 스캐폴딩 단계에서는 파일 "내용"을 읽거나 파싱하지 않는다 — env var가 비어있지 않은 문자열을
 * 가리키는지만 확인한다. 실제 서비스계정 JSON 구조 검증은 실연동 단계의 범위이며, 지금은 의도적으로
 * 범위 밖으로 남긴다(YAGNI — googleapis 등 실제 클라이언트가 생기기 전까지는 과잉 구현).
 */
export class IntegrationCredentialError extends Error {
}
export function loadIntegrationCredentialPath(envVarName) {
    const value = process.env[envVarName];
    if (!value || value.trim().length === 0) {
        throw new IntegrationCredentialError(`환경변수 ${envVarName}이 설정되지 않았습니다`);
    }
    return value;
}
//# sourceMappingURL=credential-loader.js.map