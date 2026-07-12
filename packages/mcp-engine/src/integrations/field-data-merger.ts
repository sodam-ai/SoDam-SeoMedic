import type { PageReportInput } from "../report/types.js";
import type { PsiFieldData } from "./types.js";

/**
 * field(CrUX) 데이터를 페이지 리포트에 결합하는 순수 함수(I/O 없음) — 이미 가져온 PsiFieldData를
 * 받아 합칠 뿐, 네트워크 호출은 하지 않는다(실제 fetch는 PsiClient 구현의 책임).
 *
 * report/markdown.ts·json.ts의 "lab 값 명시" 관례(`isLabData: true` + 안내 문구, CWV_NOTE)를
 * 그대로 미러링해 field 데이터도 동일하게 명시적으로 라벨링한다 — 독자가 lab과 field를 혼동하지
 * 않게 하는 것이 03_PHASES.md 성공기준("field(CrUX) 데이터가 리포트에 결합됨")의 핵심이다.
 *
 * fieldData가 null/undefined(CrUX 데이터 부족 등으로 조회 실패)면 원본 page를 그대로 반환한다 —
 * 빈 섹션을 억지로 만들지 않는다(fail-closed). 기존 필드는 절대 덮어쓰지 않는다는 점에서
 * canonical-fixer.ts의 "확실하지 않으면 아무것도 바꾸지 않는다" 원칙과 같은 방향이다.
 */
export interface FieldDataSection {
  lcpMs: number | null;
  clsUnitless: number | null;
  inpMs: number | null;
  isFieldData: true;
  note: string;
}

export interface PageReportWithFieldData extends PageReportInput {
  fieldData?: FieldDataSection;
}

const FIELD_DATA_NOTE =
  "field 데이터(CrUX, 실사용자 측정치)입니다 — 위 lab 값과 다를 수 있습니다(Google 검색 랭킹에는 field 데이터가 쓰입니다).";

export function mergeFieldData(
  page: PageReportInput,
  fieldData: PsiFieldData | null | undefined,
): PageReportWithFieldData {
  if (!fieldData) return { ...page };

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
