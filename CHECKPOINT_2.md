# SeoMedic Phase 2(GSC/GA4/PSI 연동) — 마일스톤 체크포인트

> Phase 1(M0~M9)은 `CHECKPOINT.md`, Phase 1.5(로컬 fix + GitHub PR 모드)는 `CHECKPOINT_1.5.md`에서
> 별도 추적·완료됨(1.5는 최종 318/318 — 아래 스캐폴딩 24개 포함). 이 문서는 Phase 2의 첫 작업분만
> 다룬다.

## Stage 1: JSON-LD 구조화 데이터 탐지 규칙 — 완료 (2026-07-13)

PRD 우선순위(기술SEO→콘텐츠·엔티티→**구조화(3순위)**→GEO/AEO(4순위)→측정(5순위))를 재대조한 결과,
GSC/GA4/PSI(5순위, 아래 "범위 결정" 참고)·AI 크롤러 정책(4순위, 정책 판단이라 사람 게이트 필요)보다
**구조화데이터가 우선순위상 먼저이면서 유일하게 사람 게이트 없이 완결 가능**함을 확인해 착수했다.

`R-JSONLD-MISSING`(severity low, advisory)·`R-JSONLD-INVALID`(severity high) 두 report_only 규칙을
추가했다 — **생성(gated fixer)은 만들지 않음**. 생성에 필요한 선행 인프라 5개(PageSignals 콘텐츠
확장, AST 병합 프리미티브, layout.tsx 상속 처리, schema.org 검증 라이브러리, 환각방지 게이트 설계)가
전부 공백이라 조사로 확인됐고, 이걸 한 번에 메우는 대신 "생성·검증" 중 위험이 0인 검증만 먼저 떼어낸
것 — 설계 근거 전문은 `C:\Users\PC\AppData\Roaming\claude-code\plans\crispy-coalescing-zebra.md` 참고.

- `PageSignals.hasJsonLd: boolean` → `jsonLdBlocks: string[]`로 교체(`src/render/dom-signals.ts`).
- `dom-diff.ts`에 배열 참조비교 landmine guard 추가(신규 필드의 직접 귀결, 부수 수정).
- `classifyBlock`이 "어딘가 하나라도 있으면 통과"(any-reachable) 방식으로 `@graph`/배열 루트/객체형
  `@context`/배열형 `@type` 같은 정상 schema.org 패턴을 무효로 오분류하지 않도록 설계·테스트로 회귀
  방지(`src/rules/definitions/jsonld.ts`).
- 검증: `npm run typecheck && npm run build && npm test` 전부 그린, **335/335**(기존 318 + 신규 17).

## Stage 2: Open Graph 탐지 규칙 + og:title/og:url 게이트형 fixer — 완료 (2026-07-13)

JSON-LD Stage 1 완료 후 PRD 우선순위(구조화·on-page)의 다음 조각으로 OG를 조사한 결과, JSON-LD와
달리 **필드별로 위험이 갈린다는 걸 확인**했다 — og:title/og:url은 이미 검증된 같은 페이지 값(title,
canonical)을 그대로 복사하는 것이라 창작이 없고 canonical fixer와 동일 안전 등급인 반면,
og:description(원본 없으면 생성 불가)·og:image/og:type(추론 필요)은 JSON-LD와 같은 환각 위험
카테고리다. 그래서 이번엔 **탐지 3규칙 + 실제 gated fixer 1개**까지 만들었다(JSON-LD보다 한 단계
더 나아간 결과) — 설계 근거 전문은 `crispy-coalescing-zebra.md`(최신 버전, 덮어써짐) 참고.

**PRD 문구와 프로젝트 선례의 충돌을 발견하고 의도적으로 선례를 따름**: `04_PROJECT_SPEC.md:71`은
"신규 OG/Twitter 태그 추가=add_safe"라 명시하지만, canonical이 이미 "순수 추가"임에도 `:77`의 상위
원칙("표시에 영향=gated")을 따라 gated로 오버라이드된 선례가 있다(`registry.ts` 주석). OG title/url도
소셜 공유 "표시"에 영향을 주므로 동일한 오버라이드를 일관 적용해 **gated로 분류**(PRD 표 문구를
따르지 않았으나, 이 프로젝트 자신의 더 강한 안전 원칙을 따른 것).

- `R-OG-BASIC-MISSING`(low, gated fixer 있음)·`R-OG-DESCRIPTION-MISSING`(low, fixer 없음)·
  `R-META-DESCRIPTION-MISSING`(low, fixer 없음) — `src/rules/definitions/og.ts` 신규.
- `src/fixers/og-fixer.ts` 신규 — canonical-fixer.ts의 `findStaticMetadataObject`/`hasSpreadElement`를
  의도적으로 **복제**(공유 모듈 추출 안 함 — canonical-fixer.ts는 완료된 Phase 1.5 코드라 이번
  작업 범위에서 건드리지 않는다는 Plan Mode 결정).
- `ScannedPage.renderedTitle` 추가(`scan.ts`), `plan.ts`/`apply.ts` 배선(`planJsOnlyCanonicalFixForFinding`과
  동일하게 `pages` 파라미터로 렌더된 실제 값을 가져옴 — finding.page_url만으로 소스 값을 못 구함).
- 검증: `npm run typecheck && npm run build && npm test` 전부 그린, **365/365**(기존 335 + 신규 30).
  검증 중 실측 실패 2건 발견·수정(1. 기존 known-good 6개 픽스처에 og 필드 누락으로 R-OG-* 오탐 발화,
  2. `fix-orchestrator-canonical-integration.test.ts`가 이제 R-OG-BASIC-MISSING도 함께 발생시켜
  `plannedFixes[0]` index 접근이 불안정해짐 → rule_id 기반 `.find()`로 교체) — 둘 다 새 규칙 도입의
  직접 귀결이며 로직 버그 아님.
- **명시 제외**: og:description/og:image/og:type 자동 생성, Twitter Card 전체 — 다음 라운드 후보.

## 범위 결정 — "스캐폴딩만" (실연동 아님, 왜)

`CHECKPOINT_1.5.md` 267행의 Phase 2 착수 권고("GSC·GA4·PSI 3개 외부 인증을 한번에 새로 설계해야
하고, PRD 자체가 'GEO는 프로세스 지표'라 성공기준부터 좁혀야 함 — 새 세션에서 인터뷰/스펙부터 시작
권장")를 그대로 존중한다. 실제 GSC/GA4/PSI 연동은 Google Cloud 서비스계정 발급·API 활성화·속성별
권한 부여라는 3개의 외부 인증 설정이 필요한데, PRD(`.PRD/04_PROJECT_SPEC.md` 318~326행)는 이걸
"env var 이름표"만 정의했을 뿐 단계별 절차를 문서화하지 않았다 — 이건 코드로 메울 수 있는 공백이
아니라 별도 인터뷰 세션이 필요한 진짜 스펙 공백이다.

그래서 이번 작업은 **자격증명 없이, 실제 네트워크 호출 없이 완전히 검증 가능한 부분만** 골랐다 —
`github/api-client-port.ts`(포트 인터페이스만 먼저 정의) → `github/orchestrator.ts`(그 인터페이스
에만 의존) → 가짜(fake) client로 GitHub 토큰 없이 전체 배선을 검증한 뒤, `api-client.ts`(실제
Octokit 구현)는 훨씬 뒤 단계에서 별도로 작성한 Phase 1.5b의 패턴을 그대로 미러링했다. 데이터 모델·
클라이언트 계약(포트)·테스트용 fake 구현·안전한 자격증명 경로 로딩·순수 리포트 병합 로직까지만
만들고, 실제 API 호출부·MCP 툴 배선·UX 결정(오디트가 자동으로 Integration 데이터를 병합할지, 아니면
별도 명시적 호출로 할지)은 전부 다음 세션으로 명시적으로 미룬다.

## 신규 모듈 (전부 오프라인·자격증명 없이 검증됨)

- `src/integrations/types.ts` — 포트 인터페이스만 정의(`GscClient`/`Ga4Client`/`PsiClient`) +
  `Integration` 엔티티 타입(`IntegrationRecord`/`InsertIntegrationInput`, `02_DATA_MODEL.md`
  120~130행 필드 그대로: `id`/`project_id`/`type`/`auth_method`/`credential_env_ref`/
  `property_scope`). `PsiFieldData`는 기존 lab-CWV(`cwv/lighthouse-runner.ts`의
  `CwvMeasurement`)와 필드명을 최대한 맞췄다(`lcpMs`/`clsUnitless`) — 단 INP는 lab에서만 TBT로
  근사(`inpProxyTbtMs`)했던 것과 달리 field(CrUX)는 실제 상호작용 기반 진짜 INP라 `inpMs`로
  구분 명명.
- `src/integrations/fake-clients.ts` — `FakeGscClient`/`FakeGa4Client`/`FakePsiClient`. 전부
  네트워크 호출 없는 결정론적 canned 데이터(같은 입력 → 같은 출력, 테스트로 확인).
- `src/integrations/credential-loader.ts` — `loadIntegrationCredentialPath(envVarName)`.
  `github/token.ts`와 동일 원칙: env에서만 읽고, 없으면(또는 빈 문자열/공백만이면) `env var 이름만`
  담은 에러로 fail-closed. 파일 "내용"은 읽지 않음(경로 존재 여부만 — 실제 서비스계정 JSON 구조
  검증은 의도적으로 범위 밖).
- `src/integrations/field-data-merger.ts` — `mergeFieldData(page, fieldData)` 순수 함수(I/O 없음).
  `report/markdown.ts`·`json.ts`의 "lab 값 명시" 관례(`isLabData:true` + 안내 문구)를 그대로
  미러링해 field 데이터도 `isFieldData:true` + 별도 안내 문구로 라벨링. `fieldData`가
  `null`/`undefined`면 원본을 그대로 반환(빈 섹션 생성 안 함, fail-closed).
- `src/db/migrations/0004_integration.ts` — `CREATE TABLE IF NOT EXISTS integration`
  (`type`/`auth_method` CHECK 제약 포함). 0001/0002와 동일하게 순수 `CREATE TABLE`이라
  0003(`ALTER TABLE ADD COLUMN`)의 재실행 버그 클래스가 구조적으로 발생하지 않음 —
  `connection.ts`의 실제 마이그레이션 실행 패턴(매 open마다 전체 재실행)을 직접 확인 후 결정.
  `connection.ts`에 `db.exec(MIGRATION_0004_INTEGRATION)` 한 줄만 추가(0001~0003 무수정).
- `src/db/repositories/integration.ts` — `fix.ts` 스타일 미러링:
  `insertIntegration`/`findIntegrationById`/`findIntegrationsByProject`, 전부 파라미터 바인딩
  (문자열 결합 없음).

## 검증 (테스트 24개 신규, 전부 오프라인)

- `test/unit/credential-loader.test.ts`(5) — env var 존재 시 경로 반환, 부재/빈 문자열/공백 시
  거부, 에러 메시지에 env var 이름만 포함(200자 미만 — 전체 dump 아님 방증), 서로 다른 env var
  이름이 메시지에 정확히 반영됨(하드코딩 문구 아님).
- `test/unit/fake-clients.test.ts`(5) — 3개 fake client가 실제로 well-shaped·결정론적 데이터를
  반환함을 확인.
- `test/unit/integration-repository.test.ts`(7) — 실제 SQLite 파일로 insert+find, gsc/ga4/psi
  각각 생성 확인, project별 필터링, `type`/`auth_method` CHECK 제약 실제 거부(잘못된 값 주입),
  SQL Injection 스팟체크(`db.test.ts`와 동일 패턴 — 악의적 문자열이 그대로 값으로 저장되고 테이블은
  살아있음을 확인).
- `test/unit/migration-0004.test.ts`(2) — 테이블 생성 확인 + 여러 번 open해도 안전함(0003 테스트와
  같은 취지, 이번엔 애초에 문제될 소지가 없는 CREATE TABLE임을 재확인하는 성격).
- `test/unit/field-data-merger.test.ts`(5) — field 데이터 있으면 라벨링된 섹션 추가, 있어도
  기존 lab-CWV·violations·url·statusCode가 **원본 객체 참조까지 그대로**(`toBe` — 재생성/변형
  없음) 보존됨을 확인, `null`/`undefined`면 원본과 완전히 동일(빈 섹션 생성 안 함), lab≠field 값이
  서로 다른 라벨을 유지한 채 공존.

**최종**: `npm run typecheck && npm run build && npm run test` 전부 통과 —
**318/318 테스트 통과**(Phase 1.5 종료 시점 294 + 이번 신규 24), 54개 테스트 파일. 타입체크·빌드
0 에러. 전체 스위트 1회 실행 중 `server-launcher.test.ts` 1건이 일시적으로 실패했으나(실제
Next.js dev 서버 spawn, 이 스캐폴딩 작업과 무관한 `render-bridge/` 모듈), 단독 재실행 시 즉시
통과 확인 — `CHECKPOINT_1.5.md` 161행이 이미 기록한 것과 같은 종류의 I/O 부하성 일시적 현상으로
판단(실제 결함 아님, 이 작업으로 인한 회귀 아님).

## 범위 밖임을 재확인 (의도적으로 안 한 것)

- 실제 `googleapis` 등 Google API 클라이언트 라이브러리 의존성 추가 — **없음**(package.json 확인).
- 실제(non-fake) `GscClient`/`Ga4Client`/`PsiClient` 구현 — **없음**. 포트 인터페이스 + fake만.
- `audit-orchestrator.ts`/`server.ts`/MCP 툴(`seomedic_audit` 등)에 배선 — **없음**(grep으로 확인,
  `src/db/repositories/integration.ts`가 타입 참조로 `integrations/types.ts`를 import하는 것 외에
  `src/integrations/`를 참조하는 코드는 없음).
- 실제 서비스계정 JSON **내용** 파싱/검증 — 없음(env var가 비어있지 않은지만 확인).
- `packages/plugin/`, `CHECKPOINT.md`, `CHECKPOINT_1.5.md`, Phase 1/1.5 fixer·규칙 파일, GitHub PR
  모드 파일 — 전부 무수정.
- git commit/push — 하지 않음(git-workflow 규칙, 사용자 명시 요청 시에만).

## 남은 작업 (실연동 착수 전 필요, 코드로 대신 해결 불가한 것 포함)

- [ ] **새 세션 인터뷰/스펙 선행 권장** — `CHECKPOINT_1.5.md` 267행 권고 그대로 유효. GSC/GA4/PSI
      3개 외부 인증(서비스계정 발급→API 활성화→속성 권한 부여)의 단계별 절차가 PRD에 없음 — 실연동
      착수 전 별도 세션에서 먼저 닫아야 할 진짜 스펙 공백.
- [ ] **실제 클라이언트 구현**(`api-client.ts`급) — `googleapis` 의존성 추가 + `GscClient`/
      `Ga4Client`/`PsiClient`의 실제 구현. Phase 1.5b가 `api-client-port.ts`(먼저) →
      `api-client.ts`(실토큰 검증 직전 단계에서 나중) 순서로 간 것과 동일한 순서를 따를 것.
- [ ] **실제 서비스계정 JSON 내용 검증** — 지금은 env var가 파일 경로를 가리키는 비어있지 않은
      문자열인지만 확인. 실제로 그 경로에 유효한 JSON이 있는지, 필요한 필드(private_key/client_email
      등)를 갖췄는지는 미검증 — 실연동 착수 시 추가 필요.
- [ ] **라이브 흐름/UX 배선 결정** — 오디트(`seomedic_audit`)가 Integration을 자동 감지해 field
      데이터를 병합할지, 아니면 별도 명시적 MCP 툴(`seomedic_integration_*`류)로 분리할지 아직
      결정 안 됨. 이번 작업은 의도적으로 이 결정을 내리지 않고 순수 병합 함수(`mergeFieldData`)만
      준비해뒀다 — 배선 시점에 인터뷰로 확정.
- [ ] **실제 GSC/GA4/PSI 계정으로 읽기 경로 실증** — Phase 1.5b가 GitHub 읽기 전용 API를 토큰 없이
      공개 저장소로 먼저 검증했던 것처럼, PSI는 공개 API(API 키만 필요, 속성 소유권 불요)라 가장
      먼저 실증 가능한 후보. GSC/GA4는 서비스계정 권한 부여가 선행돼야 함.

## 우선순위 자기감사 (2026-07-12, 세션 종료 전 기록)

이번 작업(GSC/GA4/PSI 스캐폴딩)은 PRD의 우선순위 원칙(`03_PHASES.md:4` "기술SEO→콘텐츠·엔티티→
구조화→**GEO/AEO(4순위)**→**측정(5순위)**")에서 **5순위(측정) 항목을 먼저 만들었다** — 4순위인
"AI 크롤러 정책"(GEO/AEO의 일부, OAI-SearchBot/GPTBot/ClaudeBot 등)이 PRD상 더 높은 우선순위였다.

**선택 기준이 "PRD 우선순위"가 아니라 "사람 게이트 없이 안전한가"였음을 정직하게 기록한다.**
GSC/GA4/PSI는 `Fix`/`gated`와 완전히 무관한 읽기전용 리포트 결합이라 사이트 훼손 위험이 구조적으로
0인 반면, AI 크롤러 정책은 noindex/robots와 같은 파일군(`robots.txt`)이라 "어떤 봇을 기본 차단할지"
자체가 AI 학습 동의라는 실제 정책 판단이다(코드가 혼자 결정하면 안 되는 지점 — noindex fixer를
거부했던 것과 같은 이유의 축소판). 이번 세션에서 그 정책 결정을 받을 시점이 아니라 판단해 미뤘다.

**다음 Phase 2 인터뷰에서 반드시 다룰 것**: GSC/GA4/PSI 실연동보다 **AI 크롤러 정책(4순위) 논의를
먼저** 가져가는 것이 PRD 우선순위에 더 부합한다 — 최소 결정 사항 1개만 있으면 됨: "검색봇
(*-SearchBot/*-User)은 기본 허용, 학습봇(GPTBot/ClaudeBot 등)은 기본 차단"이라는 PRD 자체 제안
정책(`03_PHASES.md:99` "검색봇 허용·학습봇 차단")을 그대로 채택할지 여부.

## 참고 파일

- `.PRD/02_DATA_MODEL.md` 120~130행 — Integration 엔티티 정의(이번 작업의 스키마 출처)
- `.PRD/04_PROJECT_SPEC.md` 318~326행(env var), 126행(S2 토큰 관리 요구사항)
- `.PRD/03_PHASES.md` 85~106행 — Phase 2 전체 범위(구조화데이터·GEO는 이번 작업에 포함 안 됨)
- `CHECKPOINT_1.5.md` — Phase 1.5 상세 이력 + Phase 2 착수 권고(267행)
- `src/github/api-client-port.ts`/`token.ts`/`orchestrator.ts` — 이번 작업이 그대로 미러링한 구조적
  템플릿
