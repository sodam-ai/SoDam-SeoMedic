export interface CanonicalFixPlan {
    /** false면 gated 자동 처리가 불가능한 구조라는 뜻(동적 generateMetadata, metadata 부재, 변수 참조,
     * 스프레드 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    originalText?: string;
    updatedText?: string;
}
/**
 * canonical 값은 상대경로만 쓴다(예: "/about", 루트는 "/") — 배포 도메인이 파이프라인 어디에도 없고
 * (로컬 브릿지 origin·placeholder origin 둘 다 실제 네트워크 전용이 아님), Next.js가 metadataBase
 * 기준 상대경로 해석을 공식 지원하므로 배포 도메인 무관하게 구조적으로 올바른 유일한 값
 * (Plan Mode 확정 결정 — 한계: metadataBase 미설정 시 Next.js가 localhost:3000으로 폴백하나,
 * 이 fixer의 범위 밖).
 */
export declare function planCanonicalFix(filePath: string, canonicalPath: string): CanonicalFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeCanonicalFix(filePath: string, updatedText: string): void;
