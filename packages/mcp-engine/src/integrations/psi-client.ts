import { safeFetch } from "../crawler/fetch-client.js";
import type { PsiClient, PsiFieldData } from "./types.js";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 30_000; // Google이 서버사이드에서 Lighthouse까지 계산해 응답이 느리다(공식 문서 확인) — 넉넉히
const MAX_PSI_RESPONSE_BYTES = 5 * 1024 * 1024; // lighthouseResult까지 포함된 응답 대비 여유 상한(우리는 loadingExperience만 씀)

export class PsiApiError extends Error {}

export interface PsiFetcherResult {
  status: number;
  bodyText: string;
}
export type PsiFetcher = (url: string) => Promise<PsiFetcherResult>;

async function defaultPsiFetcher(url: string): Promise<PsiFetcherResult> {
  return safeFetch(url, { timeoutMs: PSI_TIMEOUT_MS, maxBytes: MAX_PSI_RESPONSE_BYTES });
}

interface PsiRunPagespeedResponse {
  loadingExperience?: {
    metrics?: {
      LARGEST_CONTENTFUL_PAINT_MS?: { percentile: number };
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile: number };
      INTERACTION_TO_NEXT_PAINT?: { percentile: number };
    };
  };
}

/** M4(시크릿 비노출) — API 키가 에러 메시지에 그대로 남지 않게 마스킹한다(github/token.ts와 같은 방향). */
function maskApiKey(message: string, apiKey: string): string {
  return message.split(apiKey).join("***");
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
export function createPsiClient(apiKey: string, fetcher: PsiFetcher = defaultPsiFetcher): PsiClient {
  return {
    async fetchFieldData(url: string): Promise<PsiFieldData | null> {
      const endpoint = `${PSI_ENDPOINT}?url=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}`;

      let res: PsiFetcherResult;
      try {
        res = await fetcher(endpoint);
      } catch (err) {
        throw new PsiApiError(maskApiKey(`PSI API 호출 실패: ${(err as Error).message}`, apiKey));
      }

      if (res.status !== 200) {
        throw new PsiApiError(maskApiKey(`PSI API가 상태 ${res.status}를 반환했습니다: ${res.bodyText.slice(0, 300)}`, apiKey));
      }

      let data: PsiRunPagespeedResponse;
      try {
        data = JSON.parse(res.bodyText);
      } catch {
        throw new PsiApiError("PSI API 응답을 JSON으로 파싱하지 못했습니다");
      }

      const metrics = data.loadingExperience?.metrics;
      if (!metrics) return null; // CrUX 데이터 부족(트래픽 적음 등) — 실제 PSI 동작 그대로 반영, 추측 금지

      return {
        url,
        lcpMs: metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
        clsUnitless: metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
        inpMs: metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
        isFieldData: true,
      };
    },
  };
}
