export interface NoindexFixPlan {
    /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, metadata/robots 부재, robots가
     * 문자열·변수 참조, 스프레드, googleBot 별도 재정의 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    originalText?: string;
    updatedText?: string;
}
/**
 * robots.index를 false→true로 교정한다("noindex 제거"). canonical/og fixer의 "값 발명 없음" 원칙을
 * "추가"가 아니라 "이미 있는 boolean 리터럴 교정"에 적용한 사례 — 새 문구를 짓지 않고 이미 있는 false를
 * true로 뒤집기만 한다(04_PROJECT_SPEC "noindex는 gated" — 승인 게이트를 거치는 값 교정이라 title/meta
 * "기존 값 덮어쓰기 금지" 원칙과 충돌하지 않는다. 그 원칙은 "새 문구 발명"을 막는 것이지, 이미 명시된
 * boolean 오탐지를 사람 승인 하에 고치는 것을 막지 않는다).
 *
 * robots가 문자열("noindex, nofollow" 등)이거나 index가 boolean 리터럴이 아니면(변수·함수호출 등)
 * 정적으로 안전을 확신할 수 없어 report_only로 폴백한다.
 *
 * ⚠️ robots.googleBot이 별도로 존재하면 절대 손대지 않는다 — Google은 googleBot 전용 메타태그를 일반
 * robots 태그보다 우선 적용한다(공식 문서 확인 필요 항목으로 별도 표시). top-level index만 고치면
 * googleBot.index가 여전히 false로 남아있는 경우, "고쳤다"고 보고하지만 실제로는 Googlebot 기준
 * noindex가 그대로인 거짓 성공을 만들 수 있어 fail-closed로 제외한다.
 */
export declare function planNoindexFix(filePath: string): NoindexFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeNoindexFix(filePath: string, updatedText: string): void;
