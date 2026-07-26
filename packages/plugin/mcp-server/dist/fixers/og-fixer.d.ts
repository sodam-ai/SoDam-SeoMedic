export interface OgFixPlan {
    /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, metadata 부재, 변수 참조,
     * 스프레드 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    originalText?: string;
    updatedText?: string;
    /** 실제로 추가된 필드(디스플레이/diff 렌더용). 멱등 no-op이면 빈 배열. */
    added?: Array<{
        field: "title" | "url";
        value: string;
    }>;
}
/**
 * og:title/og:url을 openGraph 중첩 객체에 추가한다. 둘은 독립적으로 처리된다 — 한쪽만 없으면
 * 그것만 추가하고, 이미 있는 필드는(빈 문자열이어도) 절대 덮어쓰지 않는다(add-safe-guard.ts 원칙).
 * ogTitle/ogUrl은 이미 검증된 같은 페이지 값의 복사본이어야 한다(값을 새로 만들지 않음) — 호출부가
 * null을 넘기면 그 필드는 아예 후보에서 제외한다(복사할 원본이 없다는 뜻).
 */
export declare function planOgFix(filePath: string, ogTitle: string | null, ogUrl: string | null): OgFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeOgFix(filePath: string, updatedText: string): void;
