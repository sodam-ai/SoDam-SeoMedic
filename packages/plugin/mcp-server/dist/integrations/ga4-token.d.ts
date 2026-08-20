export interface Ga4Config {
    keyFilePath: string;
    propertyId: string;
}
/** gsc-token.ts와 동일 원칙: 둘 중 하나만 있어도 비활성(null) 취급(fail-closed, 추측 금지). */
export declare function getGa4Config(): Ga4Config | null;
