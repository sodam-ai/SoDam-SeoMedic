/**
 * GSC/GA4/PSI 연동의 포트(인터페이스)만 정의한다 — 실제 API 구현(googleapis 등)은 이 스캐폴딩
 * 범위 밖이다. github/api-client-port.ts와 동일한 원칙: 판단·병합 로직은 이 인터페이스에만 의존해
 * 작성·테스트하고, 실제 구현은 credential-loader.ts로 얻은 경로를 이용해 별도의 후속 단계에서
 * 작성한다(그때까지는 fake-clients.ts의 가짜 구현만 존재 — googleapis 의존성 추가 없음).
 */
export type IntegrationType = "gsc" | "ga4" | "psi";
export type IntegrationAuthMethod = "service_account";
export interface IntegrationRecord {
    id: number;
    project_id: number;
    type: IntegrationType;
    auth_method: IntegrationAuthMethod;
    credential_env_ref: string;
    property_scope: string;
}
export interface InsertIntegrationInput {
    projectId: number;
    type: IntegrationType;
    authMethod: IntegrationAuthMethod;
    credentialEnvRef: string;
    propertyScope: string;
}
/** GSC Search Analytics API의 표준 조회 지표(clicks/impressions/position)만 담는다 — CTR 등
 * 추가 지표는 이 스캐폴딩 범위 밖(YAGNI, 실연동 단계에서 필요해지면 추가). */
export interface GscSearchAnalyticsSummary {
    propertyScope: string;
    clicks: number;
    impressions: number;
    position: number;
}
export interface GscClient {
    fetchSearchAnalyticsSummary(propertyScope: string): Promise<GscSearchAnalyticsSummary>;
}
/** "핵심 지표"를 세션·활성 사용자 두 개로 최소화했다(GA4 Data API의 가장 기본적인 지표) — PRD가
 * GA4 지표를 구체적으로 명시하지 않아, 포트 패턴을 증명하는 데 필요한 최소 형태만 잡는다(YAGNI). */
export interface Ga4MetricsSummary {
    propertyId: string;
    sessions: number;
    activeUsers: number;
}
export interface Ga4Client {
    fetchKeyMetrics(propertyId: string): Promise<Ga4MetricsSummary>;
}
/**
 * lab 데이터(cwv/lighthouse-runner.ts의 CwvMeasurement: lcpMs/clsUnitless/inpProxyTbtMs)와
 * 필드명을 최대한 맞췄다 — field-data-merger.ts가 둘을 나란히 리포트에 결합할 때 이름만 보고도
 * 어떤 지표끼리 짝인지 바로 알 수 있게 하기 위함. 단 INP는 lab에서만 TBT로 근사(inpProxyTbtMs)했던
 * 것과 달리, field(CrUX)는 실제 사용자 상호작용 기반 진짜 INP를 제공하므로 `inpMs`로 명명해
 * "이건 근사치가 아니다"를 이름으로도 구분한다.
 */
export interface PsiFieldData {
    url: string;
    lcpMs: number | null;
    clsUnitless: number | null;
    inpMs: number | null;
    isFieldData: true;
}
export interface PsiClient {
    /** CrUX 데이터가 부족한 URL(트래픽이 적어 field 데이터가 아예 없는 경우)은 null을 반환한다 —
     * 실제 PSI API 동작(loadingExperience 필드 자체가 없을 수 있음)을 그대로 반영한 계약. */
    fetchFieldData(url: string): Promise<PsiFieldData | null>;
}
