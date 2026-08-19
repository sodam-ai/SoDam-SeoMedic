import { safeFetch } from "../crawler/fetch-client.js";
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 30_000; // Google이 서버사이드에서 Lighthouse까지 계산해 응답이 느리다(공식 문서 확인) — 넉넉히
// lighthouseResult에 스크린샷 썸네일(base64) 등이 포함돼 응답이 수 MB까지 커질 수 있다(우리는
// loadingExperience만 쓰지만 API가 lighthouseResult를 끄는 옵션을 제공하지 않음) — crawler/fetch-client.ts의
// 일반 상한(20MB)과 동일하게 맞춰 정상 응답이 상한에 걸려 조용히 실패하는 일을 방지한다(검증 중 5MB가
// 타이트할 수 있다는 점을 발견해 상향).
const MAX_PSI_RESPONSE_BYTES = 20 * 1024 * 1024;
export class PsiApiError extends Error {
}
async function defaultPsiFetcher(url) {
    return safeFetch(url, { timeoutMs: PSI_TIMEOUT_MS, maxBytes: MAX_PSI_RESPONSE_BYTES });
}
/** 신뢰할 수 없는 API 응답에서 percentile을 꺼낸다 — 유한수가 아니면(문자열·null·NaN 등) null(추측 금지). */
function readPercentile(metric) {
    const value = metric?.percentile;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/**
 * M4(시크릿 비노출) — API 키가 에러 메시지에 그대로 남지 않게 마스킹한다(github/token.ts와 같은 방향).
 * 원본 키뿐 아니라 URL에 실제로 실려 나가는 encodeURIComponent 인코딩 형태도 함께 지운다 — 공백·`+`
 * 등 URL-비안전 문자가 섞인 키는 두 형태가 달라, 원본만 지우면 요청 URL을 그대로 담은 에러 메시지
 * (예: 네트워크 오류 메시지)에서 인코딩된 키가 그대로 노출될 수 있다(재현 테스트로 발견·수정).
 */
function maskApiKey(message, apiKey) {
    return message.split(apiKey).join("***").split(encodeURIComponent(apiKey)).join("***");
}
/**
 * Google PSI v5 runPagespeed를 호출해 loadingExperience(CrUX field 데이터)만 뽑는다. lab 데이터는
 * 이미 cwv/lighthouse-runner.ts가 우리 자신의 Lighthouse 실행으로 확보하므로 PSI 응답의
 * lighthouseResult(같은 응답에 항상 포함됨 — API가 끌 방법을 제공하지 않음, 공식 문서로 확인)는 무시한다.
 *
 * CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile은 CLS 값에 100을 곱한 정수다 — 공식 문서 예시
 * (percentile 20 + category "AVERAGE")로 확인: CLS 0.20은 실제로 "개선 필요(AVERAGE)" 등급과
 * 일치하지만 CLS "20"은 그 자체로 무의미한 값이라 스케일링이 맞다는 정황까지 교차 확인했다.
 * LCP/INP는 밀리초 단위 그대로. ⚠️ 이 스케일링은 실제 API 키로 아직 재검증하지 못했다(공개 문서
 * 기준 — CHECKPOINT.md에 정직하게 남긴다).
 *
 * fetcher는 기본값(safeFetch 기반)이 실제 프로덕션 동작이고, 테스트는 실제 키·네트워크 없이 canned
 * 응답을 주입한다(crawler/sitemap.ts의 SitemapFetcher와 동일한 DI 패턴 — Google 서버 호출은 느리고
 * (수십초) 결정적이지 않아 CI에 부적합하다는 이 저장소의 기존 판단과 일관됨).
 */
export function createPsiClient(apiKey, fetcher = defaultPsiFetcher) {
    return {
        async fetchFieldData(url) {
            const endpoint = `${PSI_ENDPOINT}?url=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}`;
            let res;
            try {
                res = await fetcher(endpoint);
            }
            catch (err) {
                throw new PsiApiError(maskApiKey(`PSI API 호출 실패: ${err.message}`, apiKey));
            }
            if (res.status !== 200) {
                throw new PsiApiError(maskApiKey(`PSI API가 상태 ${res.status}를 반환했습니다: ${res.bodyText.slice(0, 300)}`, apiKey));
            }
            let data;
            try {
                data = JSON.parse(res.bodyText);
            }
            catch {
                throw new PsiApiError("PSI API 응답을 JSON으로 파싱하지 못했습니다");
            }
            const metrics = data.loadingExperience?.metrics;
            if (!metrics)
                return null; // CrUX 데이터 부족(트래픽 적음 등) — 실제 PSI 동작 그대로 반영, 추측 금지
            const clsPercentile = readPercentile(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE);
            return {
                url,
                lcpMs: readPercentile(metrics.LARGEST_CONTENTFUL_PAINT_MS),
                clsUnitless: clsPercentile !== null ? clsPercentile / 100 : null,
                inpMs: readPercentile(metrics.INTERACTION_TO_NEXT_PAINT),
                isFieldData: true,
            };
        },
    };
}
//# sourceMappingURL=psi-client.js.map