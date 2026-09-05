# SeoMedic — 커버리지 맵 (SEO / AI 검색 14개 영역)

> **v2.6 (2026-09-05 신규 작성)** · 기반: 사용자가 제공한 14개 영역 목록 + **실제 코드 grep 실측 대조**
> 상위 문서: [01_PRD.md](./01_PRD.md) §3 핵심 기능 · [03_PHASES.md](./03_PHASES.md) Phase 2~3

---

## 이 문서가 존재하는 이유

2026-09-05, 사용자가 "SeoMedic이 다뤄야 할 SEO/AI검색 영역" 14개 목록을 제공했다.
**다음 세션이 처음부터 다시 조사하지 않고 바로 착수할 수 있도록**, 그 14개를 이 저장소의
실제 코드와 1:1로 대조한 결과를 여기에 고정한다.

### 이 14개의 위상 — 사용자가 직접 확인해준 의도 (2026-09-05)

> *"현재 구현중인 목표 + 더욱 더 기능 확장을 목표로 알려준 것"*

즉 이 14개는 **골라서 몇 개만 하는 후보 목록이 아니라, SeoMedic이 최종적으로 커버하려는 목표
지형 전체**다. 이미 구현된 5개(Technical SEO·OG·Sitemap/robots·Canonical·CWV)도 "별개의 기존
기능"이 아니라 **이 목표 지형 중 이미 도달한 지점**이다.

**이 위상이 중요한 이유**: 아래 표에서 어떤 항목이 "지금은 어렵다"로 판정되더라도, 그건
**목표에서 빠진다는 뜻이 아니라 도달 시점과 방법이 아직 안 정해졌다는 뜻**이다. 다음 세션이
"불가"라고 적힌 항목을 제품 범위에서 삭제해버리면 사용자의 목표를 임의로 축소하는 것이 된다.

### ⚠️ CHECKPOINT.md의 "scope creep 경고"와의 관계 — 반드시 먼저 읽을 것

`CHECKPOINT.md`(2026-09-01 섹션 말미)에 이런 경고가 있다:

> *"다음 세션이 이 섹션을 보고 '코드로 뭔가 더 할 게 없을까'를 찾으려 하면, 그건 실제 필요가
> 아니라 불필요한 범위 확장(scope creep) 위험이다."*

**이 문서는 그 경고를 어긴 것이 아니다.** 그 경고는 *AI가 스스로 일감을 만들어내는 것*을 막는
문장이고, 이 14개 영역은 **2026-09-05에 사용자가 직접 지시한 범위 확장**이다.
두 문장이 충돌한다고 오판하지 말 것 — 판단 기준은 "누가 발제했는가"다.

---

## 대조 방법 (재현 가능 — 다음 세션이 그대로 다시 돌려볼 수 있음)

```bash
# 구현된 규칙 ID 전체
grep -rhoE '"R-[A-Z0-9_-]+"' packages/mcp-engine/src/rules/definitions/ | tr -d '"' | sort -u

# 특정 영역이 코드에 존재하는지 (0건이면 미구현)
grep -rli "twitter:" packages/mcp-engine/src        # X Cards
grep -rli "hreflang\|E-E-A-T\|llms.txt" packages/mcp-engine/src
grep -rhoE '"(WebSite|Organization|Person|Article|BreadcrumbList|Product|FAQPage)"' \
  packages/mcp-engine/src/rules/ packages/mcp-engine/src/fixers/ | sort | uniq -c
```

**실측 시점: 2026-09-05, 커밋 `0146467`(PR #27 병합) 기준.**
코드가 바뀌면 이 표도 낡는다 — 판단 전에 위 명령을 다시 돌려 대조할 것.

---

## 14개 영역 × 현재 커버리지

범례: ✅ 구현됨 · 🟡 부분(핵심만/얕음) · ❌ 코드 0건

| # | 영역 | 상태 | 근거 파일 (실측) |
|---|------|------|------------------|
| 1 | **SEO**(일반 검색 노출) | 🟡 부분 | `rules/definitions/content-structure.ts`(title·h1·alt), `og.ts`(meta description) |
| 2 | **Technical SEO** | ✅ | `status-redirect.ts`(4xx·5xx·리다이렉트 체인), `raw-rendered-gap.ts`, `render-bridge/` |
| 3 | **Schema.org·JSON-LD·Entity SEO** | 🟡 **얕음** | 지원 타입이 **WebSite·Product·FAQPage 3종뿐**(`jsonld.ts`·`jsonld-required-fields.ts`·`qa-structure.ts`). **Organization·Person·Article·BreadcrumbList·sameAs = 코드 0건** |
| 4 | **OG (Open Graph)** | ✅ | `rules/definitions/og.ts` + `fixers/og-fixer.ts` |
| 5 | **Sitemap + robots.txt** | ✅ | `crawler/sitemap.ts`, `crawler/robots.ts`, `fixers/sitemap-fixer.ts`, `fixers/robots-ai-policy-fixer.ts` |
| 6 | **Canonical** | ✅ | `canonical.ts`(MISSING·JS-ONLY) + `fixers/canonical-fixer.ts` |
| 7 | **Core Web Vitals** | ✅ | lab = LCP/CLS/TBT(`cwv-threshold.ts`, TBT는 INP 프록시), field = 진짜 INP(`integrations/psi-client.ts:100`) |
| 8 | **E-E-A-T** | ❌ | 코드 0건. `RESEARCH_SOURCES*.md`에 개념 언급만 |
| 9 | **AEO** | 🟡 부분 | `qa-structure.ts`(FAQPage 존재 여부) 규칙 1개가 전부 |
| 10 | **GEO** | 🟡 부분 | `crawler/ai-crawler-policy.ts`(봇 11종 카탈로그, 확인일 2026-07-14) — **접근 허용 판정만**, 콘텐츠 측 최적화는 없음 |
| 11 | **LLMO / AI Search 최적화** | 🟡 부분 | 위 10번과 동일 기반. **`llms.txt` = 코드 0건** |
| 12 | **X Cards** | ❌ | `twitter:` 문자열이 **코드 전체에서 0건** |
| 13 | **AI Visibility·인용 추적** | ❌ | 측정 기능 자체가 부재. **PRD 확정 결정과 충돌 → 아래 "미결 결정" 참고** |
| 14 | **Crawler / Indexing 관리** | 🟡 부분 | noindex 규칙+fixer(`indexing.ts`·`noindex-fixer.ts`), AI봇 접근 리포트는 있음. 단 GSC는 `searchanalytics`만 사용 — **URL Inspection API 미사용이라 "실제 색인됐는가"는 확인 불가**(`integrations/gsc-client.ts`) |

---

## 그룹 분류 — 비용과 위험이 완전히 다르다

### 그룹 A — 기존 틀에 그대로 얹힘 (저비용)

SeoMedic은 **규칙(rule) 22개 + 수정기(fixer) 8개를 레지스트리에 등록**하는 구조라,
아래는 "새 파일 1개 + `rules/registry.ts` 또는 `fixers/registry.ts`에 한 줄 추가"로 끝난다.

- **12번 X Cards** — `og.ts` / `og-fixer.ts`를 그대로 복제하는 형태
- **3번의 일부** — Organization·BreadcrumbList·Article JSON-LD (`jsonld-website-fixer.ts` 패턴 재사용)
- **11번의 `llms.txt`** — `sitemap-fixer.ts`와 같은 "루트 파일 생성" 패턴

### 그룹 B — 설계 판단이 먼저 필요함

- **8번 E-E-A-T** — 기계적 판정이 **원리적으로 불가능한 주관 영역**이다. 가능한 것은
  "저자 정보·출처 링크·최종 수정일이 마크업에 존재하는가" 같은 **대리 지표 체크**뿐.
  → **자동수정(fixer) 대상으로 만들면 안 된다.** 없는 저자를 지어내는 환각 위험 직결
  (`04_PROJECT_SPEC.md`의 "환각 0" 원칙 위반).
- **14번 색인 실측** — GSC URL Inspection API는 **하루 2,000회 쿼터 제한**(다음 세션에서
  1차 문서 재확인 필요)이 있어, 사이트모드(최대 200페이지)와 조합할 때 정책이 필요하다.

### 그룹 C — 별도 Phase로 분리해야 함 (MVP 금지)

- **13번 AI Visibility·인용 추적** — 지금 SeoMedic은 **"1회 분석 → 수정"** 구조인데,
  이건 **"반복 모니터링 + 외부 AI 서비스 호출"** 이라 3번째 축을 새로 만드는 규모다.
  게다가 ChatGPT·Gemini 응답을 얻으려면 (a) 각 벤더 유료 API 또는 (b) 스크래핑인데,
  **(b)는 약관 위반 소지 + 이 프로젝트의 "소유 사이트만·텔레메트리 금지" 원칙과 정면 충돌**한다.

---

## 권장 착수 순서 (다음 세션용)

> ⚠️ **이 표는 코드 실측 전에 만든 1차 판단이다.** 같은 날 소스코드를 정독한 결과 **12번 X Cards의
> 평가가 바뀌었다** — 아래 "코드 실측 후 재평가" 절과 `CHECKPOINT.md`의 2026-09-05
> "다음 세션 작업 계획" 섹션 §3을 반드시 함께 볼 것. 충돌 시 **재평가 쪽이 정본**이다.

> **근거**: 이 순서는 임의 판단이 아니라 `03_PHASES.md` 머리말이 이미 못박아 둔 우선순위 원칙과 일치한다 —
> *"기술 SEO → 콘텐츠·엔티티 → 구조화 → GEO/AEO → **측정**"*(자료 22장 기반). 그래서 엔티티(3번)가 먼저,
> **측정 성격인 13번이 맨 뒤**다. 여기에 ①기존 아키텍처 재사용도 ②위험도를 더해 정렬했다.
> 사용자가 순서를 바꾸면 그 지시가 우선.

| 순위 | 항목 | 이유 | 예상 규모 |
|------|------|------|-----------|
| **1** | 3번 Entity 확장 (Organization·BreadcrumbList·Article) | **Phase 2 기능표에 이미 있는 항목**이라 범위 확장이 아님. JSON-LD fixer 패턴 존재 | 규칙 3 + fixer 1~2 |
| **2** | 12번 X Cards | 가장 싸고 독립적. 단 **아래 "검증 선행" 참고** | 규칙 1 + fixer 1 |
| **3** | 9번 AEO 확장 | Phase 2 "Q&A 구조" 항목의 자연 확장 | 규칙 1~2 |
| **4** | 14번 색인 실측(GSC URL Inspection) | 사용자 순위 3(GSC 실연동)이 끝나야 실검증 가능 → **선행 의존성 있음** | 통합 1 |
| **5** | 11번 `llms.txt` | **표준 지위 재확인 선행 필요**(아래) | fixer 1 |
| **6** | 8번 E-E-A-T 대리지표 | 분석 전용(report-only), 자동수정 금지 | 규칙 2~3 |
| **보류** | 13번 AI 인용 추적 | PRD 결정과 충돌 — 사용자 결정 전 착수 금지 | Phase 3급 |

### 착수 전 반드시 1차 출처로 검증할 것 2건 (지금은 **가설**이지 확인된 사실이 아님)

1. **X Cards의 실익** — X는 `twitter:` 태그가 없으면 **OG 태그로 폴백**하는 것으로 알려져 있다
   (가능성 높음, 미확인). 사실이라면 4번(OG)이 이미 구현된 지금 12번의 실익은 **카드 종류 지정
   (`summary` vs `summary_large_image`)에 한정**된다. → X 공식 문서로 확인한 뒤 우선순위를 다시 판단할 것.
2. **`llms.txt`의 표준 지위** — 제안된 관행일 뿐 주요 AI 벤더가 공식 채택했는지는 **미확인**이다.
   채택 근거가 약하면 구현해도 효과가 없다. → OpenAI/Anthropic/Google 1차 문서 확인 후 결정.

이 프로젝트는 `ai-crawler-policy.ts`처럼 **코드 주석에 1차 출처와 확인 일자를 남기는 관례**가
있다. 위 2건도 같은 방식으로 근거를 남길 것.

---

## 미결 결정 3건 — 사용자 결정 필요 (AI가 임의로 정하지 말 것)

### 결정 1 — 13번(AI 인용 추적)을 언제·어떤 축으로 구현할 것인가

> ⚠️ **질문의 성격 정정(2026-09-05)**: 처음엔 "제품 범위에 넣을 것인가"로 적었으나, 사용자가
> 14개를 **목표 지형 전체**로 제시했음이 확인되어 **13번은 이미 목표에 포함**이다. 남은 질문은
> "넣을까 말까"가 아니라 **"기존 PRD 결정을 어떻게 개정하고, 어느 시점에 어떤 구조로 만들 것인가"** 다.

**충돌하는 기존 확정 결정:**
- `01_PRD.md:157` — *"GEO/AEO 본격·AI 노출 보장 — 효과 비결정적. Phase 2에서 입력 위생·프로세스 지표까지만"*
- `03_PHASES.md:98` — *"성공기준 (⚠️ GEO는 결과가 아닌 프로세스 지표)"*, *"노출 여부는 측정 대상 아님 — 비결정적"*

즉 **"AI 노출은 측정하지 않는다"가 현재 PRD의 확정 결정**이다. 13번은 이 결정을 뒤집는 요구다.
뒤집을지 여부는 제품 정체성 문제라 사용자만 결정할 수 있다.

### 결정 2 — 새 영역들을 Phase 2에 넣을 것인가, Phase 4를 새로 만들 것인가

Phase 2는 이미 "구조화·GEO 기초 + 성과 연동"으로 정의돼 있고 기능 3개가 명시돼 있다.
3·9·11·12번을 Phase 2에 **추가**하면 Phase 2의 완료 판정이 뒤로 밀린다.
(Phase 2는 현재 코드는 완료, 사용자의 외부 작업 2건만 남은 상태 — `CHECKPOINT.md` 2026-09-01 섹션)

### 결정 3 — 14개 목록의 출처 (부분 해소)

사용자 확인으로 **위상은 확정**됐다(현재 구현 목표 + 확장 목표). 다만 이 분류 체계 자체가
외부 자료를 참고한 것이라면 `RESEARCH_SOURCES-ADD.md`에 출처를 남기는 편이 이 프로젝트의
근거 관례와 정합한다 — 필수는 아니고 정리 차원.

---

## 다음 세션 시작 체크리스트

1. 이 문서와 `CHECKPOINT.md` 최하단 2개 섹션(2026-09-01, 2026-09-05)을 먼저 읽는다.
2. 위 **미결 결정 3건**을 사용자에게 확인한다. (특히 결정 1 — 이걸 건너뛰고 13번에 착수하면 안 됨)
3. 착수 전 **"검증 선행 2건"**(X Cards 폴백, `llms.txt` 표준 지위)을 1차 출처로 확인한다.
4. 코드 변경은 **반드시 별도 브랜치**에서 하고, PR 생성·머지·릴리스는 사용자가 결정한다
   (2026-08-21 확정 규칙 — `master` 직접 push 금지).
5. 규칙을 추가하면 `rules/registry.ts` 등록 + 단위 테스트 + `README.md` 4종(md·en.md·html·en.html)
   갱신까지가 한 세트다 — 문서 누락은 이 프로젝트에서 "완료 아님"으로 취급한다(`01_PRD.md:143`).


---

## 🔄 코드 실측 후 재평가 (2026-09-05, 같은 날 후속 — 이 절이 정본)

위 표를 만든 뒤 실제 소스코드(`fixers/registry.ts`, `rules/types.ts`, `02_DATA_MODEL.md`, DB 마이그레이션)를
정독한 결과, **구현 가능성 판정이 일부 바뀌었다.** 상세 근거와 위험 분석은 `CHECKPOINT.md`의 2026-09-05
"다음 세션 작업 계획" 섹션에 있고, 여기에는 PRD 판단에 직접 영향을 주는 3가지만 남긴다.

### 바뀐 판정 1 — X Cards는 "완전 구현"이 불가능하다

이 프로젝트의 fixer 9종은 **예외 없이 "이미 페이지에 있는 값을 복사"만 한다**(값 발명 금지).
그런데 `twitter:card` 타입(`summary` 인지 `summary_large_image` 인지)은 **복사할 원본이 페이지에 없다.**
이미지 실제 크기를 재야 정할 수 있는데 그 기능이 현재 없다(코드 0건).
→ **X Cards는 제목·설명·이미지(OG 복사분)만 구현하고, 카드 타입은 report_only로 남긴다.**

### 바뀐 판정 2 — Entity SEO는 name 수준까지만 자동수정 가능하다

Organization의 `logo`·`sameAs`(SNS 링크)·주소는 페이지에 원본이 없다. 이걸 채우면 값 발명이 된다.
이는 기존 JSON-LD WebSite fixer가 **url 필드를 일부러 비워둔 것과 완전히 같은 이유**다.
→ Entity 확장은 **name 추가 + BreadcrumbList(URL 경로에서 파생)** 까지가 자동수정의 한계선이다.

### 바뀐 판정 3 — 일부 영역은 페이지 단위 규칙엔진에 구조적으로 안 맞는다

`fixers/registry.ts`에 이미 기록된 결론: *"규칙엔진은 페이지 단위로만 평가하도록 설계돼 있어,
사이트 전체 비교가 필요한 항목은 그 모델에 안 맞는다."* sitemap이 그래서 규칙엔진을 우회한다.
→ **Entity의 관계 표현**(여러 페이지에 걸친 연결)과 **13번 AI 인용 추적**(사이트 단위 + 시계열)이
같은 제약에 걸린다. 우선순위 문제가 아니라 **아키텍처 판정을 먼저 해야 하는 문제**다.

### PRD 관점의 결론

주신 14개 영역 중 **자동수정(fixer)까지 갈 수 있는 것은 소수**이고, 나머지는 **분석·리포트 전용**이
이 제품의 정체성에 맞다. 이는 축소가 아니라, `01_PRD.md`가 정한 *"값 발명 없음 · 환각 0"* 원칙을
새 영역에도 그대로 적용한 결과다. 실제 PRD 본문(01~04) 개정은 위 "미결 결정 3건"이 정해진 뒤에 한다.
