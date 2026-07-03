import { assertLocalBridgeUrl } from "./local-loopback.js";

/**
 * next start가 매 실행마다 임의의 포트에 뜨기 때문에(예: http://127.0.0.1:53214/about),
 * 이 실제 주소를 그대로 finding_key 해싱에 쓰면 "실행마다 finding_key가 바뀌는" 문제가 생긴다
 * (Plan Mode 설계에서 발견 — Phase 1 회귀 감지와 Phase 1.5 멱등성이 fix 모드에서 무력화될 뻔함).
 *
 * 그래서 finding_key 계산에는 이 고정 placeholder 호스트를 쓰고, 실제 임시 주소는
 * AuditRun.render_source 필드에만 기록한다(디버깅·추적용, 해싱에는 쓰지 않음).
 *
 * ⚠️ 이 함수의 반환값은 실제 네트워크 요청에 절대 사용하면 안 된다 — 해싱/DB 저장 전용 값이다.
 */
const LOGICAL_PLACEHOLDER_ORIGIN = "http://local.seomedic.internal";

export function toLogicalPageUrl(localUrl: string, expectedOrigin: string): string {
  const url = assertLocalBridgeUrl(localUrl, expectedOrigin); // 실제 로컬 브릿지 URL인지 재검증 후 변환
  return LOGICAL_PLACEHOLDER_ORIGIN + url.pathname + url.search;
}
