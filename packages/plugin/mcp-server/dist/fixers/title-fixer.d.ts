export interface TitleFixPlan {
    /** false면 gated 자동 처리가 불가능한 구조(동적 generateMetadata, metadata 부재, 변수 참조,
     * 스프레드, 복사할 h1 부재 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    originalText?: string;
    updatedText?: string;
}
/**
 * title이 raw/rendered 어디에도 전혀 없을 때(R-TITLE-MISSING), 같은 페이지의 렌더된 h1 텍스트를
 * 그대로 복사해 metadata.title에 채운다 — canonical/og-fixer.ts와 동일한 "값 발명 없음" 원칙을
 * "이미 있는 필드 값 복사"가 아니라 "이미 페이지에 실제로 존재하는 다른 텍스트(h1)를 그대로 복사"에
 * 적용한 사례다. 새 문구를 짓지 않는다 — h1이 없으면 복사할 원본이 없으므로 report_only로 폴백한다.
 *
 * `export const metadata`가 이미 존재하면(다른 필드가 있어 title만 빠진 경우) 그 객체에 title만
 * 추가한다. metadata export 자체가 파일에 전혀 없으면(generateMetadata도 없을 때) 새 export 블록을
 * 처음부터 삽입한다(tryInsertNewMetadataExport, B-1 확장) — 단 'use client' 컴포넌트는 Next.js가
 * metadata export 자체를 금지하므로 제외한다.
 */
export declare function planTitleFix(filePath: string, h1Title: string | null): TitleFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeTitleFix(filePath: string, updatedText: string): void;
