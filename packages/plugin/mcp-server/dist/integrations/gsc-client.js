import { safeFetch } from "../crawler/fetch-client.js";
import { defaultAccessTokenProvider } from "./google-auth-token.js";
// 공식 문서(developers.google.com/webmaster-tools/v1/searchanalytics/query, 2026-08-20 직접 확인) 근거.
const GSC_ENDPOINT_BASE = "https://www.googleapis.com/webmasters/v3/sites";
const GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const GSC_TIMEOUT_MS = 30_000;
const MAX_GSC_RESPONSE_BYTES = 5 * 1024 * 1024;
const SUMMARY_WINDOW_DAYS = 28; // psi-client.ts의 CWV 리포팅 관례와 맞춘 "최근 성과" 기본 창
export class GscApiError extends Error {
}
async function defaultGscFetcher(url, init) {
    return safeFetch(url, { method: "POST", headers: init.headers, body: init.body, timeoutMs: GSC_TIMEOUT_MS, maxBytes: MAX_GSC_RESPONSE_BYTES });
}
function formatDate(d) {
    return d.toISOString().slice(0, 10);
}
/** Bearer 토큰이 fetcher 예외 메시지 등에 실려 나올 가능성을 방어적으로 차단(M4, psi-client.ts의 maskApiKey와 동일 방향). */
function maskToken(message, token) {
    return message.split(token).join("***");
}
/** 신뢰할 수 없는 API 응답에서 숫자를 꺼낸다 — 유한수가 아니면 0(추측 금지, psi-client.ts readPercentile과 동일 원칙). */
function readNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
/**
 * Google Search Console(Search Analytics) 실제 REST 클라이언트. PSI(단순 API 키)와 달리 서비스계정
 * OAuth2가 필요해 google-auth-library로 액세스 토큰을 먼저 얻은 뒤, 그 토큰으로 이 파일이 직접
 * `searchAnalytics.query`를 POST 호출한다(googleapis 전체 SDK 대신 필요한 엔드포인트 하나만 얇게
 * 구현 — Simplicity First).
 *
 * `dimensions`를 빈 배열로 보내면(공식 문서 확인) 페이지·쿼리별 세부 분류 없이 지정 기간 전체의 집계
 * 행 1개만 돌아온다 — 이 포트가 요구하는 "요약값 하나"에 정확히 맞는 형태라 별도 합산 로직이 불필요.
 * `rows`가 없거나 비어 있으면 그 기간에 집계할 활동이 없다는 뜻(그 기간 데이터가 아직 처리 전이거나
 * 완전히 0일 수 있음 — 어느 쪽이든 값을 지어내지 않고 0으로 정직하게 표현한다).
 *
 * fetcher/tokenProvider 둘 다 DI — 실제 프로덕션 값이 기본값이고, 테스트는 실제 서비스계정·네트워크
 * 없이 canned 토큰·canned 응답을 주입한다(psi-client.ts와 동일한 이유: Google 서버 호출은 느리고
 * 비결정적이라 CI에 부적합).
 */
export function createGscClient(keyFilePath, fetcher = defaultGscFetcher, tokenProvider = defaultAccessTokenProvider) {
    return {
        async fetchSearchAnalyticsSummary(propertyScope) {
            let token;
            try {
                token = await tokenProvider(keyFilePath, GSC_SCOPES);
            }
            catch (err) {
                throw new GscApiError(`GSC 인증 실패: ${err.message}`);
            }
            const end = new Date();
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - SUMMARY_WINDOW_DAYS);
            // 가장 최근 1~2일은 Search Console 자체 처리 지연으로 데이터가 비어있거나 불완전할 수 있다(공식
            // 문서 예시 — 조회 범위 끝쪽 날짜에 데이터가 없는 경우가 실제로 있음을 확인). 그렇다고 endDate를
            // 임의로 며칠 당기지는 않는다 — 정확한 지연 일수를 공식 문서에서 확인하지 못했으므로 추측값을
            // 코드에 박아넣지 않고, API가 실제로 돌려주는 값(불완전하면 그만큼 작은 집계)을 그대로 신뢰한다.
            const url = `${GSC_ENDPOINT_BASE}/${encodeURIComponent(propertyScope)}/searchAnalytics/query`;
            const body = JSON.stringify({ startDate: formatDate(start), endDate: formatDate(end), dimensions: [] });
            let res;
            try {
                res = await fetcher(url, { headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body });
            }
            catch (err) {
                throw new GscApiError(maskToken(`GSC API 호출 실패: ${err.message}`, token));
            }
            if (res.status !== 200) {
                throw new GscApiError(maskToken(`GSC API가 상태 ${res.status}를 반환했습니다: ${res.bodyText.slice(0, 300)}`, token));
            }
            let data;
            try {
                data = JSON.parse(res.bodyText);
            }
            catch {
                throw new GscApiError("GSC API 응답을 JSON으로 파싱하지 못했습니다");
            }
            const row = data.rows?.[0];
            return {
                propertyScope,
                clicks: readNumber(row?.clicks),
                impressions: readNumber(row?.impressions),
                position: readNumber(row?.position),
            };
        },
    };
}
//# sourceMappingURL=gsc-client.js.map