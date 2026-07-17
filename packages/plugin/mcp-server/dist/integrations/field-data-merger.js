const FIELD_DATA_NOTE = "field 데이터(CrUX, 실사용자 측정치)입니다 — 위 lab 값과 다를 수 있습니다(Google 검색 랭킹에는 field 데이터가 쓰입니다).";
export function mergeFieldData(page, fieldData) {
    if (!fieldData)
        return { ...page };
    return {
        ...page,
        fieldData: {
            lcpMs: fieldData.lcpMs,
            clsUnitless: fieldData.clsUnitless,
            inpMs: fieldData.inpMs,
            isFieldData: true,
            note: FIELD_DATA_NOTE,
        },
    };
}
//# sourceMappingURL=field-data-merger.js.map