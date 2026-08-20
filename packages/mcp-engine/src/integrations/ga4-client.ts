import { safeFetch } from "../crawler/fetch-client.js";
import { defaultAccessTokenProvider, type AccessTokenProvider } from "./google-auth-token.js";
import type { Ga4Client, Ga4MetricsSummary } from "./types.js";

// 공식 문서(developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport,
// 2026-08-20 직접 확인) 근거.
const GA4_ENDPOINT_BASE = "https://analyticsdata.googleapis.com/v1beta/properties";
const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const GA4_TIMEOUT_MS = 30_000;
const MAX_GA4_RESPONSE_BYTES = 5 * 1024 * 1024;
const SUMMARY_WINDOW_DAYS = 28; // gsc-client.ts와 동일한 "최근 성과" 기본 창(둘 다 나란히 리포트에 실릴 값이라 창을 맞춤)

export class Ga4ApiError extends Error {}

export interface Ga4FetcherResult {
  status: number;
  bodyText: string;
}
export type Ga4Fetcher = (url: string, init: { headers: Record<string, string>; body: string }) => Promise<Ga4FetcherResult>;

async function defaultGa4Fetcher(url: string, init: { headers: Record<string, string>; body: string }): Promise<Ga4FetcherResult> {
  return safeFetch(url, { method: "POST", headers: init.headers, body: init.body, timeoutMs: GA4_TIMEOUT_MS, maxBytes: MAX_GA4_RESPONSE_BYTES });
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function maskToken(message: string, token: string): string {
  return message.split(token).join("***");
}

/**
 * GA4 Data API는 metricValues를 전부 **문자열**로 반환한다(공식 문서 응답 예시로 확인 — 정수형
 * 지표도 `"5000"`처럼 문자열). 문자열이 아닌 값이 오면(응답 스키마가 바뀌었거나 손상된 경우) 신뢰하지
 * 않고 0으로 처리한다(M5, psi-client.ts readPercentile과 동일 원칙 — 추측 금지).
 */
function readMetricValue(value: unknown): number {
  if (typeof value !== "string") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Google Analytics 4 Data API(`runReport`) 실제 REST 클라이언트. gsc-client.ts와 완전히 동일한
 * 구조(google-auth-library로 토큰 획득 → 이 파일이 직접 REST POST)를 따른다 — 두 클라이언트가 인증
 * 방식을 공유하므로 중복을 최소화하되(google-auth-token.ts 공유), fixer들이 서로 로직을 의도적으로
 * 복제해 온 이 프로젝트의 기존 관례상 REST 호출 자체는 각 파일이 독립적으로 갖는다(서로 다른 API
 * 스키마·에러 처리를 무리하게 하나로 추상화하지 않음).
 *
 * metrics를 sessions·activeUsers 두 개만 요청하고 dimensions는 생략한다(공식 문서 확인 — dimensions
 * 없이 요청하면 지정 기간 전체의 집계 행 1개만 반환) — Ga4MetricsSummary 포트가 요구하는 "요약값
 * 하나"에 정확히 맞는 최소 형태(YAGNI, types.ts 주석과 동일 판단).
 *
 * propertyId는 "properties/" 접두사 없는 순수 ID를 받는다(PRD 04_PROJECT_SPEC.md 환경변수 표
 * "GA4_PROPERTY_ID | GA4 속성 ID" 그대로) — REST 경로에 필요한 `properties/` 접두사는 이 함수가
 * 붙인다(공식 문서의 `{property=properties/*}` 리소스 이름 패턴).
 */
export function createGa4Client(
  keyFilePath: string,
  fetcher: Ga4Fetcher = defaultGa4Fetcher,
  tokenProvider: AccessTokenProvider = defaultAccessTokenProvider,
): Ga4Client {
  return {
    async fetchKeyMetrics(propertyId: string): Promise<Ga4MetricsSummary> {
      let token: string;
      try {
        token = await tokenProvider(keyFilePath, GA4_SCOPES);
      } catch (err) {
        throw new Ga4ApiError(`GA4 인증 실패: ${(err as Error).message}`);
      }

      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - SUMMARY_WINDOW_DAYS);

      const url = `${GA4_ENDPOINT_BASE}/${encodeURIComponent(propertyId)}:runReport`;
      const body = JSON.stringify({
        dateRanges: [{ startDate: formatDate(start), endDate: formatDate(end) }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      });

      let res: Ga4FetcherResult;
      try {
        res = await fetcher(url, { headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body });
      } catch (err) {
        throw new Ga4ApiError(maskToken(`GA4 API 호출 실패: ${(err as Error).message}`, token));
      }

      if (res.status !== 200) {
        throw new Ga4ApiError(maskToken(`GA4 API가 상태 ${res.status}를 반환했습니다: ${res.bodyText.slice(0, 300)}`, token));
      }

      let data: { rows?: { metricValues?: unknown[] }[] };
      try {
        data = JSON.parse(res.bodyText);
      } catch {
        throw new Ga4ApiError("GA4 API 응답을 JSON으로 파싱하지 못했습니다");
      }

      const values = data.rows?.[0]?.metricValues;
      return {
        propertyId,
        sessions: readMetricValue(values?.[0]),
        activeUsers: readMetricValue(values?.[1]),
      };
    },
  };
}
