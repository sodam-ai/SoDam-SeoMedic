export interface MetaDescriptionFixPlan {
    /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, 변수 참조, 스프레드,
     * 복사할 본문 문단 부재, 'use client' 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    originalText?: string;
    updatedText?: string;
}
/**
 * description이 raw/rendered 어디에도 전혀 없을 때(R-META-DESCRIPTION-MISSING), <main> 태그 안의
 * 첫 문단(<p>) 텍스트를 그대로 복사해 metadata.description에 채운다. <main>이 없거나 그 안에 문단이
 * 없으면(복사할 원본이 없음) report_only로 폴백한다 — title-fixer.ts와 달리 "본문 어디를 발췌할지"
 * 자체가 판단이 개입될 수밖에 없는 문제라, HTML5가 명시적으로 "본문 전용"으로 보장하는 <main> 밖은
 * 절대 보지 않는다(nav/footer 오염 방지, 2026-09-01 설계 결정).
 */
export declare function planMetaDescriptionFix(filePath: string, mainFirstParagraphText: string | null): MetaDescriptionFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeMetaDescriptionFix(filePath: string, updatedText: string): void;
