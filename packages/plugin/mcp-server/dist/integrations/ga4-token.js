// GSC와 동일 서비스계정 env var를 공유한다 — PRD 환경변수 표에 GA4 전용 경로가 따로 없고, 실무에서도
// 한 서비스계정에 Search Console·GA4 두 속성 권한을 함께 부여하는 것이 일반적이다(gsc-token.ts 참고).
const GA4_SERVICE_ACCOUNT_PATH_ENV = "GSC_SERVICE_ACCOUNT_PATH";
const GA4_PROPERTY_ID_ENV = "GA4_PROPERTY_ID";
/** gsc-token.ts와 동일 원칙: 둘 중 하나만 있어도 비활성(null) 취급(fail-closed, 추측 금지). */
export function getGa4Config() {
    const keyFilePath = process.env[GA4_SERVICE_ACCOUNT_PATH_ENV];
    const propertyId = process.env[GA4_PROPERTY_ID_ENV];
    if (!keyFilePath || keyFilePath.trim().length === 0)
        return null;
    if (!propertyId || propertyId.trim().length === 0)
        return null;
    return { keyFilePath, propertyId };
}
//# sourceMappingURL=ga4-token.js.map