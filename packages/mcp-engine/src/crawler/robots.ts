// robots-parser@3.0.1이 배포하는 index.d.ts는 `declare module 'robots-parser';`(shorthand ambient, any화)와
// 같은 파일 내 `export default function robotsParser(...)`가 충돌해 "not callable"로 타입체크 실패한다(실측 확인됨).
// 패키지 쪽 타입 선언 결함이라 우리 쪽에서 최소 인터페이스를 직접 선언해 우회한다.
import robotsParserFactory from "robots-parser";
import { safeFetch } from "./fetch-client.js";

interface ParsedRobots {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
  getSitemaps(): string[];
}
const robotsParser = robotsParserFactory as unknown as (url: string, robotstxt: string) => ParsedRobots;

const CRAWLER_UA = "SeoMedicBot";
const MAX_ROBOTS_BYTES = 500 * 1024; // 500KB 상한(비정상적으로 거대한 robots.txt 방어)

export interface RobotsPolicy {
  isAllowed(url: string): boolean;
  crawlDelaySeconds: number | undefined;
  sitemaps: string[];
}

/**
 * robots.txt를 가져와 정책 객체를 만든다.
 * - 404(없음): 사양대로 전체 허용으로 취급
 * - 조회 자체가 실패(5xx·타임아웃·네트워크 오류): 정책을 알 수 없으므로 **보수적으로 전체 거부**
 *   (허용 여부가 불확실할 때 크롤을 강행하지 않는다는 원칙 — DO-NOT "권한 없는 사이트 무단 크롤 금지"와 일관)
 */
export async function loadRobotsPolicy(origin: string): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", origin).toString();

  let body = "";
  let statusCode: number | undefined;
  try {
    const res = await safeFetch(robotsUrl, { maxBytes: MAX_ROBOTS_BYTES });
    statusCode = res.status;
    if (res.status === 200) {
      body = res.bodyText;
    }
  } catch {
    statusCode = undefined; // 네트워크/SSRF 등으로 조회 자체가 실패
  }

  if (statusCode === 404) {
    return allowAllPolicy();
  }
  if (statusCode !== 200) {
    return denyAllPolicy(); // 5xx·타임아웃·조회실패 → 보수적 거부
  }

  const robot = robotsParser(robotsUrl, body);
  return {
    isAllowed(url: string): boolean {
      const allowed = robot.isAllowed(url, CRAWLER_UA);
      return allowed !== false; // undefined(판단불가)는 관대하게 허용, 명시적 false만 거부
    },
    crawlDelaySeconds: robot.getCrawlDelay(CRAWLER_UA),
    sitemaps: robot.getSitemaps(),
  };
}

function allowAllPolicy(): RobotsPolicy {
  return { isAllowed: () => true, crawlDelaySeconds: undefined, sitemaps: [] };
}

function denyAllPolicy(): RobotsPolicy {
  return { isAllowed: () => false, crawlDelaySeconds: undefined, sitemaps: [] };
}
