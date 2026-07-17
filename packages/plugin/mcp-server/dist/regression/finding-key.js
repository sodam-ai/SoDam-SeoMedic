import { createHash } from "node:crypto";
/**
 * URL 정규화 — 크롤 중복방지(queue.ts)와 finding_key 계산이 반드시 같은 규칙을 써야
 * "같은 페이지인데 다른 키로 잡히는" 회귀 매칭 불일치가 안 생긴다(M0~M4 설계 메모에서 지적된 위험).
 * 규칙: 스킴/호스트 소문자화, 기본 포트(80/443) 제거, fragment 제거, 트레일링 슬래시 통일(루트 "/"는 유지).
 * 쿼리스트링은 그대로 유지한다(다른 쿼리는 실무상 다른 페이지로 취급).
 */
export function normalizeUrl(rawUrl) {
    const u = new URL(rawUrl);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
        u.port = "";
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
        u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
}
/**
 * 안정 매칭키 = hash(정규화된 page_url + rule_id + rule_version).
 * finding.id(실행 내부 지역 ID)는 회귀 비교에 쓰면 안 된다 — 이 키만 실행 간 비교에 쓴다(v1.1 결함수정 반영).
 */
export function computeFindingKey(pageUrl, ruleId, ruleVersion) {
    const normalized = normalizeUrl(pageUrl);
    const material = `${normalized}|${ruleId}|${ruleVersion}`;
    return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
//# sourceMappingURL=finding-key.js.map