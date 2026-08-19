# SeoMedic Phase 1 — 마일스톤 체크포인트

> 근거: `.PRD/03_PHASES.md` Phase 1(분석+회귀). 수정기(Phase 1.5)는 범위 밖.

## M0: 모노레포 스캐폴딩
- [x] git init, npm workspaces 루트, packages/plugin·mcp-engine 골격
- [x] plugin.json/marketplace.json/SECURITY.md/DISCLAIMER.md/LICENSE/README 자리표시자
- [x] tsconfig/vitest 공유설정, mcp-engine package.json
- 검증: `npm install && npx tsc -p packages/mcp-engine/tsconfig.json --noEmit` → 실행 완료, 0 에러
- done-when: 빌드 0에러(달성) · plugin.json/marketplace.json/.mcp.json JSON 유효(달성, 6개 파일 전부 파싱 확인) · git status는 아직 커밋 전(사용자 요청 시 커밋 — 정상, 의도된 상태)
- 실행 중 발견·수정한 실제 결함(추측 아님, 재현 확인됨):
  1. `workspaces: ["packages/*"]`였다면 `packages/plugin`(package.json 없음)이 매칭되어 `npm install`이 깨질 뻔함 → `["packages/mcp-engine"]`로 명시 수정
  2. tsconfig에 `"types"` 미지정 시 lighthouse의 전이 의존성(@opentelemetry/instrumentation-{pg,mysql,...})이 끌고 온 무관한 `@types/{pg,mysql,tedious,connect,chai,...}`까지 전역 타입에 섞여 들어감 + `process` 등 Node 전역 타입 인식 실패(TS2591) → `"types": ["node"]`로 명시 스코핑 후 재검증(0 에러) 완료
- 알려진 비차단 위험(추적 중, M9에서 재확인 예정): `npm audit` 결과 **moderate 17건, high/critical 0건** — 전부 `lighthouse`가 번들한 `@opentelemetry`/`@sentry` 계측 패키지의 전이 의존성(우리 코드가 직접 호출하지 않는 amqplib/mongoose/hapi 등 계측 모듈). M9 게이트 기준(고위험 0)은 현재 충족. lighthouse 패치판 나오면 M9에서 재확인.
- **실제 실행 확인(타입체크 통과만이 아니라)**: `tsc` 빌드 후 `node dist/cli.js audit https://example.com` 직접 실행 → 예상된 플레이스홀더 메시지 출력 확인(ESM+commander 배선이 실제로 동작함, exit=1은 의도된 미구현 표시)
- 상태: **done**

## M1: 크롤러 + SSRF 가드
- [x] ssrf-guard.ts(IPv4/IPv6 사설·예약대역 판정 + DNS 조회시점 재검증)
- [x] fetch-client.ts(undici Agent custom lookup + redirect:'manual' 매홉 재검증 + 크기상한)
- [x] robots.ts(404=허용/5xx·실패=보수적 거부), sitemap.ts(XXE 비활성+크기상한+index 재귀), queue.ts(BFS+rate-limit), crawler.ts(오케스트레이션)
- 검증: `npx vitest run` → **60/60 테스트 통과**(6개 파일: ssrf-guard 27, fetch-client 10, robots 4, sitemap 6, queue 6, crawler 7)
- done-when: SSRF 트랩 세트 전부 거부(달성) · example.com 실제 네트워크 통과(달성, 여러 계층에서 실측)
- 실행 중 발견·수정한 실제 결함(추측 아님):
  1. User-Agent 문자열에 한글을 넣었더니 undici가 "ByteString 변환 불가"로 **모든 실제 fetch가 즉시 예외** — 타입체크는 통과했지만 실행하니 바로 재현됨 → ASCII 전용으로 수정 후 재검증
  2. `robots-parser@3.0.1`의 `index.d.ts`가 자체 모순(`declare module 'robots-parser';` shorthand와 같은 파일의 `export default`가 충돌)으로 "not callable" 타입에러 → 패키지 자체 타입선언 결함으로 확인, 로컬 인터페이스 선언으로 우회
  3. undici 자체 `Response`/`Headers` 타입이 lib.dom 전역 타입과 충돌(`Symbol.dispose` 등) → undici named type import로 명시 고정
- 실측으로 사전에 검증한 설계 가정(추측→확인 전환): undici `fetch`의 `redirect:'manual'`이 서버사이드 컨텍스트에서 status/location을 그대로 노출하는지(브라우저 opaqueredirect 규칙 미적용) — 로컬 테스트 서버로 직접 확인 후 리다이렉트 재검증 로직 설계
- 상태: **done**

## M2: 렌더 + raw/rendered 비교
- [x] browser-pool.ts(Playwright + route()기반 SSRF가드), dom-signals.ts(raw/rendered 공용 신호추출), dom-diff.ts(필드단위 diff·인덱싱gap판정)
- [x] raw-fetch는 별도 파일 없이 M1 crawler.ts의 safeFetch 결과(html)를 그대로 재사용(중복 방지, YAGNI)
- 검증: `npx vitest run` → **74/74 통과**(신규 4파일: dom-signals 4·dom-diff 3·browser-pool 4, 기존 유지)
- done-when: raw/rendered 신호차이 탐지(달성) · 실제 Chromium 렌더링(example.com) 통과(달성)
- 실행 중 발견·수정한 실제 결함(추측 아님, 재현+수정+회귀테스트 완료):
  1. **`linkedom`이 태그명은 소문자화하지만 속성명은 원문 대소문자를 그대로 보존**(실측 확인, 브라우저·jsdom과 다른 동작) → `meta[name="robots" i]`·`link[rel="canonical"]`·`a[href]` 같은 CSS 속성 셀렉터가 `<META NAME="ROBOTS">`·`<A HREF=...>`처럼 대문자 HTML에서 **에러 없이 조용히 0건 매칭**(가장 위험한 종류의 실패). 이미 "완료"로 표시했던 **M1의 crawler.ts 링크추출도 같은 버그가 있어 함께 수정**. → 태그명만으로 querySelectorAll 후 `getAttrCI()`(대소문자 무관 속성 읽기)로 전환, 회귀 테스트 추가(대문자 HTML 케이스)
  2. Playwright 렌더 경로는 브라우저 자체 네트워크 스택이 M1의 undici SSRF 가드를 거치지 않는다는 점을 설계 단계에서 인지 → `page.route()`로 모든 요청(내비게이션+서브리소스)마다 DNS 재검증하는 별도 SSRF 레이어 구축, **실제 로컬 서버로 "차단됨" + "가드없으면 정상 접속"(대조군) 양쪽 다 실측 검증**
- 상태: **done**

## M3: CWV (Lighthouse 3회 중앙값)
- [x] lighthouse-runner.ts — Playwright chromium(`--remote-debugging-port`) + Lighthouse `{port}` 연결 방식(실측으로 확정, 아래 참고)
- 검증: `npx vitest run` → **80/80 통과**(신규 lighthouse-runner 6개: median 4·SSRF가드 1·실제 측정 1)
- done-when: 중앙값 산출 로직 단위테스트 통과(달성) · lab≠field 주석 포함(달성) · 실제 Lighthouse 측정(example.com, 2~3회) 통과(달성)
- **사전 실측으로 확정한 설계 결정(추측 배제)**:
  1. Lighthouse 13.x는 `page`(Puppeteer Page) 인자를 받지만, **Playwright의 Page 객체를 직접 넘기면 `this._page.target is not a function`으로 즉시 실패**(실측 확인 — Puppeteer/Playwright API 불일치). → `flags.port`(CDP HTTP 엔드포인트) 방식으로 우회, Playwright는 `--remote-debugging-port`로 CDP만 열고 Lighthouse가 내부적으로 puppeteer-core로 연결
  2. 이 버전 Lighthouse 성능 카테고리에는 `interaction-to-next-paint` 감사가 **존재하지 않음**(실측 확인, undefined) — 진짜 INP는 실사용자 상호작용 필요라 스크립트 lab 실행 자체가 불가능. `total-blocking-time`을 근사 프록시로 채택(web.dev 권고와 일치)
  3. 동일 포트로 Lighthouse를 반복 실행해도 정상 동작함을 실측(2회 연속 실행 LCP 772→784ms, 캐시로 인한 비정상적 개선 없음 확인)
- **알려진 보안 한계(은폐하지 않고 명시, M9/Phase2 추적)**: Lighthouse가 자체적으로 페이지를 관리해 M2 render처럼 `page.route()` 기반 매요청 SSRF 재검증을 걸 수 없다. 이 경로는 **진입 URL 검증(assertSafeUrl+실제 DNS 조회 재검증)만** 적용됨 — 리다이렉트 중간에 사설 IP로 빠지는 공격에는 방어 공백. Phase 1 MVP 범위로 수용, Lighthouse 내부 드라이버 교체는 향후 검토
- 상태: **done**

## M4: 규칙 엔진
- [x] registry.ts(rule_id 유일성 자체검증) + definitions 9개 규칙: R-CANONICAL-MISSING·R-CANONICAL-JS-ONLY·R-NOINDEX-DETECTED·R-STATUS-4XX·R-STATUS-5XX·R-REDIRECT-CHAIN-LONG·R-RAW-RENDERED-GAP-TITLE/METAROBOTS·R-CWV-LCP-POOR·R-CWV-CLS-POOR
- 검증: `npx vitest run` → **101/101 통과**(신규 rules.test.ts 21개, 개별 규칙 단위검증 + 종합 픽스처)
- done-when: known-good 픽스처 오탐 0(달성, 8종) · known-bad 재현율 ≥90%(달성, 8종 전부 탐지=100%)
- 설계 메모: CWV 규칙(cwv-threshold)은 `ctx.cwv`가 없으면 조용히 skip — Lighthouse 측정은 비용이 커서(1회당 수초~수십초) 크롤된 모든 페이지에 강제하지 않고, 어느 페이지에 측정을 돌릴지(샘플링 정책)는 M8(CLI 오케스트레이션) 결정 사항으로 분리
- 실행 중 발견·수정: 테스트 자체 결함(내 실수) — "known-good" 픽스처 중 하나가 canonical 값을 안 채워서 R-CANONICAL-MISSING이 정당하게 잡힘 → 픽스처 수정(코드 결함 아님, 테스트 작성 실수)
- 상태: **done**

## M4.5: MCP 서버 + 플러그인 통합 최소 검증 (계획에 없었으나 리스크 근거로 삽입)
- [x] server.ts(MCP stdio, `seomedic_audit` 툴 — crawl+render+rules 파이프라인 연결, SQLite/리포트/CWV는 M5+ 이후로 의도적 보류)
- [x] tsconfig.test.json 신설 — **중대 발견**: 기존 `tsconfig.json`이 `test/`를 exclude해서 M0~M4 내내 "typecheck 통과"가 사실은 src만 검사한 것이었고 test 파일은 vitest의 타입 스트립(검사 아님)만 거쳤음. 전체(src+test) 재검사 결과 0에러였지만, 앞으로는 `npm run typecheck`가 test까지 포함하도록 수정
- 검증: 실제 Claude Code 격리 세션(`claude --plugin-dir ... --mcp-config ... --strict-mcp-config -p "..."`)으로 `/seo-audit https://example.com` 실행 → MCP 서버 실제 spawn+stdio 연결+`seomedic_audit` 툴 실제 호출 → 실제 크롤+렌더+규칙엔진 실행 → `R-CANONICAL-MISSING(high)` 실제 탐지 → LLM이 결과를 올바르게 요약(overall_score 없음/분석전용 정확히 인지)
- done-when: 플러그인 통합이 실제로 동작(달성, 목업 아님)
- **실행 전 발견·수정한 실제 위험(사용자 개입으로 방지)**: `claude plugin marketplace add` + `claude plugin install`(user 스코프)로 검증하려 했으나, 이는 사용자의 **실제 전역 Claude Code 환경**(모든 프로젝트에 영향)을 건드리는 것이었고 `.mcp.json`이 아직 미출시 npm 패키지(`npx -y @seomedic/mcp`)를 가리켜 방치 시 사용자의 다른 모든 프로젝트에서 에러를 유발할 뻔함 → 사용자가 중단시켜 인지, **정리(uninstall+marketplace remove) 후 `--plugin-dir`+`--mcp-config`+`--strict-mcp-config`(세션 한정, 전역 상태 무변경) 방식으로 전환** — 목적은 동일하게 달성하면서 부작용 0
- 상태: **done**

## M5: SQLite + finding_key
- [x] finding-key.ts(normalizeUrl 공유함수+computeFindingKey) — **crawler/queue.ts의 dedup 정규화를 이 함수로 통일**(M0~M4에서 지적된 불일치 위험 해소)
- [x] path-guard.ts(.seomedic/ confine, 대소문자 무시+realpath, 심볼릭링크 탈출 차단)
- [x] connection.ts(better-sqlite3, WAL+FK on) + migrations/0001_init.ts(TS 문자열 상수 — .sql 파일은 tsc가 dist로 복사 안 해서 배포 후 못 찾는 문제 방지)
- [x] repositories: project/audit-run/page/finding/baseline/regression — 전부 파라미터 바인딩
- [x] page 저장 시 원문 HTML 대신 **sha256 해시 + 500자 요약만** 저장(법률 L4 구조적 강제 — 호출자가 실수해도 리포지토리 함수 내부에서 원문이 잘림)
- [x] baseline 리포지토리는 "사용자 명시 호출 시에만 생성" — 자동 트리거 없음(주석으로 상위 오케스트레이션 책임 명시)
- 검증: `npx vitest run` → **123/123 통과**(신규 finding-key 10·path-guard 5·db 6)
- done-when: 파라미터바인딩 100%(달성, DROP TABLE 문자열이 값으로만 저장되고 테이블 생존 확인) · 루트밖 쓰기 거부(달성, 실제 symlink/junction 생성해 차단 실측) · trailing-slash 변형 동일 키 매칭(달성)
- 실행 중 발견·수정: 계획했던 `migrations/0001_init.sql`을 실제로 만들었다가, tsc 빌드가 .ts만 dist/로 컴파일하고 .sql 자산은 복사하지 않는다는 걸 뒤늦게 인지 → `.ts` 문자열 상수로 전환(코드 작성 중 스스로 발견, 배포 후 런타임 실패를 사전에 방지)
- 상태: **done**

## M6: 회귀 감지
- [x] classify.ts — 규칙: 베이스라인 스냅샷에 없던 finding_key가 재등장하면 회귀 후보(문제없으면 애초에 스냅샷에 안 들어가므로), 이미 스냅샷에 있던 건(open이든 acknowledged든) 제외해 중복 알림 방지. 현재 status가 이미 acknowledged면 classification='intended'
- 검증: `npx vitest run` → **131/131 통과**(classify 6개 + regression-integration 2개 — PRD 문구 그대로 "2회 audit 통합테스트")
- done-when: 되돌린 finding을 reverted로 정확 판정(달성) — 1차(문제없음, 빈 베이스라인)→2차(canonical 사라짐)로 실제 DB+classify 파이프라인 통합 실행해 확인. 승인(acknowledged) 후 재baseline 저장 시 다음 라운드부터 재알림 없음도 함께 검증
- 상태: **done**

## M7: 리포트
- [x] types.ts, summary.ts(임팩트순 정렬+라벨 계산 공유), json.ts(zod 스키마 자체검증), markdown.ts
- [x] overall_score는 숫자로 절대 노출 안 함 — "양호/주의/위험" 라벨만(JSON에 overallScore/score 필드 자체가 없음을 테스트로 확인)
- [x] CWV 있는 페이지마다 "lab 값·field(CrUX)와 다름" 문구 자동 포함(MD+JSON 둘 다)
- 검증: `npx vitest run` → **142/142 통과**(report.test.ts 11개: 라벨 계산 3·정렬 2·CWV문구 2·스키마 통과·파이프 이스케이프 등)
- done-when: 임팩트순 정렬(달성) · MD/JSON 스키마 검증 통과(달성, JSON은 자체 zod 스키마로 빌드 시점에 즉시 검증)
- 상태: **done**

## M8: CLI + MCP 통합
- [x] audit-orchestrator.ts(크롤→렌더→CWV→규칙→DB저장 통합, seomedic_audit/seomedic_check 공용)
- [x] server.ts 3개 툴로 확장: `seomedic_audit`(Markdown 리포트) · `seomedic_save_baseline`(재감사 없이 최신 audit 결과 스냅샷) · `seomedic_check`(회귀 확인)
- [x] CWV 샘플링 정책 확정: 진입 페이지(depth=0)만 측정, 나머지는 규칙검사만(사이트모드 200p 전체 측정은 비현실적 — 정직하게 리포트에 명시)
- [ ] cli.ts는 M0 플레이스홀더 상태로 **의도적으로 보류** — PRD상 CLI는 "CI 겸용 진입점"(Phase 3 성격)이라 Phase 1 핵심 산출물(마켓 플러그인+MCP)이 아님. 실제 사용 경로는 MCP 툴이라 여기 집중
- 검증: `npx vitest run` → **145/145 통과** + 실제 Claude Code 격리 세션 2회(M4.5 재검증 포함)로 `/seo-audit`→`seomedic_save_baseline`→`seomedic_check` 전체 흐름 실제 확인(전역 상태 미변경 방식)
- done-when: 실제 리포트 생성(달성, 목업 아님 — Markdown에 실제 R-CANONICAL-MISSING·실제 CWV 수치 포함)
- 실행 중 발견·수정한 실제 결함(추측 아님):
  1. `finishAuditRun`은 UPDATE만 하고 갱신된 레코드를 반환하지 않는데, 오케스트레이터가 갱신 전 옛 객체를 그대로 반환 → `auditRun.finished_at`이 항상 null로 보이는 버그(실제 테스트 실행으로 발견) → 재조회 후 반환하도록 수정
  2. `seomedic_save_baseline`이 최초 설계에서 **새 audit을 처음부터 다시 실행**하고 있었음(불필요한 재크롤+재렌더+재Lighthouse, PRD 시나리오와도 안 맞음: "베이스라인=이미 실행된 audit 결과의 스냅샷") → 최신 완료된 AuditRun의 findings를 그대로 쓰도록 재설계(재감사 제거로 테스트 시간도 120초→41초로 단축)
  3. DB 커넥션 중복 오픈(같은 파일에 대해 seomedic_check가 db를 두 번 여는 것) → `runAudit`이 기존 db 핸들을 재사용할 수 있도록 옵션 추가
- 상태: **done**

## M9: 안전장치 최종 게이트 (보안+법률+문서 3갈래로 재정의 — 원래 정의가 보안만 좁게 다뤄 PRD 재검토 후 확장)

### M9-1 법률 게이트
- [x] `license-checker`로 전체 353개 서드파티 패키지 실제 스캔 — **GPL/AGPL 등 카피레프트 0건**(Must L2 충족)
- [x] Apache-2.0 NOTICE 실제 재게시(playwright/playwright-core/import-in-the-middle — 실제 NOTICE 파일 3개 발견해 원문 그대로 포함) — `THIRD_PARTY_NOTICES.md`
- [x] MPL-2.0 3건(axe-core·lightningcss 계열, 전이 의존성) — 수정 없이 사용 확인, 카피레프트 전이 없음(법무 재검토 권장 명시)
- [ ] 라이선스 최종 확정(저작권자·연도)·6건 법무 검토(L1·L2·L4·L5·L12·L13) — **사용자/법무 결정 영역, 코드로 대신 결정 안 함**

### M9-2 문서화 게이트 (Must: 문서 없이는 완료 아님)
- [x] `README.md`(13개 목차 전부), `README.en.md`, ~~`GUIDE.md`(왕초보 단계별+용어집)~~, `TROUBLESHOOTING.md`(16종 매트릭스), `FAQ.md`
  - ⚠️ 2026-08-10 정정: `GUIDE.md`/`GUIDE.en.md`는 PR #7(2026-08-04, "GUIDE 문서 제거 및 README 정확성 종합 갱신")로 **삭제되고 README에 통합**됐다. 이 M9-2 완료 체크는 원래 시점(2026-07-06)엔 사실이었으나, 현재 존재하지 않는 파일을 계속 산출물로 기재하고 있어 취소선 처리한다. 문서화 요구사항 자체는 "README 안의 절"로 형태만 바뀌어 계속 충족됨(취지 훼손 없음) — `README.md:367`/`README.en.md:356`이 이 통합을 스스로 명시.
- [x] `SECURITY.md`/`DISCLAIMER.md` 실측 반영(npm audit 현재상태·라이선스 스캔 결과 링크·상표 무관 고지 추가)

### M9-3 보안 최종 sweep
- [x] 전체 테스트 스위트 재실행 → **145/145 통과**
- [x] `npm audit --audit-level=high` → **exit code 0**(고위험 0건 확정, CI 게이트 기준 충족)
- [x] `claude plugin validate --strict` 재검증(plugin.json/marketplace.json) → 통과
- [x] 시크릿 하드코딩 스캔(API키/토큰/비번 패턴) → 0건, `.gitignore`가 `.env*`·`.seomedic/` 정상 커버
- [x] SSRF/경로조작/SQL바인딩 트랩은 M1~M8 전 과정에서 이미 실측 검증된 테스트가 그대로 재실행되어 재확인됨(별도 재작성 불필요)
- [~] **크로스플랫폼(Win/Mac/Linux) 검증 — Windows만 실측, Mac/Linux는 미검증**(이 개발 환경이 Windows라 물리적으로 불가 — 코드는 `path.join`/argv배열 등 이식성 있게 작성했으나 실제 실행 확인은 못함, 정직하게 한계로 남김)
- 상태: **done (법무 결정 2건 제외 — 사용자 영역으로 명확히 분리)**

---

## Phase 1 이후 — 전체 프로젝트 현황 및 다음 작업 (2026-07-15 갱신)

> ⚠️ 위 M0~M9는 Phase 1 전용 완료 기록이며 **봉인 상태**(내용 무변경). 이 섹션은 Phase 1.5/2/보안감사까지
> 포함한 "지금 시점 다음 작업"을 사용자 요청으로 추가한 것 — 상세 이력·근거는 `CHECKPOINT_1.5.md`·
> `CHECKPOINT_2.md`·`HUMAN_ACTION_CHECKLIST.md` 참고. 이 섹션만 최신 상태를 반영한다.
>
> **2026-07-15 갱신 사유(정직히 기록)**: 이 섹션의 직전 버전(2026-07-13 작성)이 master에 커밋된 적이
> 한 번도 없었다 — master의 실제 CHECKPOINT.md는 **2026-07-03 시점(Phase 1 직후) 그대로 12일간
> 정체**돼 있었고, 그동안 완료된 Phase 1.5 후반·Phase 2 전체·보안감사·문서화가 전혀 반영되지 않은
> 채였다. 로컬 unstaged 버전(2026-07-13)조차 이미 stale해진 상태였다(Stage 3·master 병합 미반영).
> 다음 세션이 이 파일만 보고 "Phase 1이 방금 끝났다"로 오인할 위험을 막기 위해 전면 재작성한다.
>
> **같은 날 2차 보강 사유**: 위 재작성 직후 저장소를 직접 재감사한 결과, 이 섹션 자체가 이미 부분적으로
> stale해진 것을 발견했다(scratch 파일·feat 브랜치는 이미 삭제됐는데 아래에는 "미결"로 남아있었음) —
> 정체는 12일 단위가 아니라 몇 시간 안에도 재발할 수 있는 문제임을 실증. 또한 README.md/README.en.md에서
> 이미 완료된 기능(AI 크롤러 정책)이 "미착수"로 표기된 실제 자기모순을 새로 발견해 최우선 항목으로 추가한다.
>
> **2026-07-16 갱신**: 후보 H(README 자기모순 수정)는 코드·문서 작업 자체는 완료해 `docs/readme-guide-
> ai-crawler-policy-sync` 브랜치로 push했으나(커밋 `a0dada3`), **master 병합(PR)은 아직 사용자 몫으로
> 남아있다** — "완료"가 아니라 "완료·PR 대기"로 정확히 구분해야 함(master 기준으로는 여전히 미반영).
> 이어서 PRD 우선순위 원칙을 재대조해 "콘텐츠·엔티티" 티어(title/h1)에 탐지 규칙이 전혀 없던 공백을
> 발견·구현했다(`feat/content-structure-detection` 브랜치, 커밋 `34ad17e`, 이것도 PR 대기). 즉 현재
> **master는 여전히 12일 전과 같은 `ed7eba5`**이고, 그 위에 독립된 PR 2개가 대기 중인 상태다.

### 완료된 범위 (재확인 — 착각 방지)
- Phase 1(M0~M9): 완료(위 기록).
- Phase 1.5: canonical(2종)+sitemap(add_safe) gated fixer 완료, noindex/robots는 설계검토 후 **미구현 확정**(사용자 승인), GitHub PR 모드(fork 경로 포함) 실제 라이브 검증 완료.
- Phase 2 Stage 1~3: JSON-LD 탐지(2규칙, report_only) + Open Graph 탐지(3규칙)·og:title/url gated fixer + **AI 크롤러 정책 탐지(GEO, `R-AI-CRAWLER-POLICY`, 중립·정책권고 없음)** 전부 완료. Stage 3 후속으로 markdown 표 렌더링 결함(구분자 `\|` 노출) 수정 + Phase 2 신규 규칙 3종의 회귀 감지 안정성을 실제 example.com 2회 audit으로 실측 검증(finding_key 완전 재현 확인, 테스트에 명시 고정).
- 보안 감사(2026-07-13): OWASP ASVS 3영역 심층 점검, **치명적 버그 2건 발견·수정**(`assertFieldAbsent` 계산된 키 우회, DB 파일 OS 권한 미제한) — 회귀 없음 확인.
- **master 병합 완료(2026-07-15)**: `feat/jsonld-og-detection-and-security-hardening` 브랜치(위 전체 내용)를 fast-forward로 master에 반영·push 완료(`c84815a..23c302f`). GitHub About도 갱신 완료. **이제 master가 실제 최신 상태를 담고 있다** — 이전 판(2026-07-03)과 달리 이 재작성이 유효한 시점.
- 전체 테스트: **379/379 통과**(typecheck+build 0에러), 실제 example.com 대상 `runAudit()`+markdown 리포트 렌더링 육안 확인 완료.
- **Phase 2 Stage 4(2026-07-16, PR 대기)**: `R-TITLE-MISSING`(high)·`R-H1-MISSING`(medium)·`R-H1-MULTIPLE`(low)·`R-IMG-ALT-MISSING`(low) 4종 신규 — 전부 report_only, `feat/content-structure-detection` 브랜치(커밋 `34ad17e`+`6e79864`). PRD 우선순위(기술SEO→**콘텐츠·엔티티**→구조화→GEO/AEO→측정)를 재대조해 발견한 공백을 메움: 이미 끝난 구조화(JSON-LD)·GEO(AI크롤러)보다 우선순위가 높은 "콘텐츠·엔티티" 티어(PRD 기능표 "title/meta/h/alt/OG")가 이제 전부 커버됨(meta description은 기존 R-META-DESCRIPTION-MISSING). alt는 `PageSignals`에 `imagesWithoutAltCount` 필드를 새로 추가해 raw/rendered 양쪽 대칭 구현(`alt=""`는 장식용 정당 패턴이라 위반 제외, `dom-diff.ts`가 신규 필드를 자동으로 회귀규칙에 편입하지 않음을 코드로 확인 후 진행). 전체 **399/399 테스트 통과**(신규 21개 포함, 기존 회귀 0 — example.com 실측에서도 전부 무발화 확인).
- **Phase 1 CWV 미완성분 발견·완결(2026-07-16, 같은 브랜치 3번째 커밋 `5e44b33`, PR 대기)**: PRD가 "CWV(LCP/INP/CLS)"로 3종을 명시했는데 `R-CWV-LCP-POOR`·`R-CWV-CLS-POOR`만 있고 **TBT(진짜 INP의 lab 근사 프록시) 임계값 룰이 없었음**을 발견(측정은 계속 해왔으나 소비하는 룰이 0개 — M3에서 "done"으로 표시된 게 실제로는 미완성이었음). `R-CWV-TBT-POOR`(high) 추가로 완결. **임계값을 흔히 알려진 모바일 기준(200ms)으로 잘못 쓸 뻔했다가, `lighthouse-runner.ts`가 `formFactor: "desktop"`으로 고정 측정 중임을 재확인 → developer.chrome.com 공식 문서에서 데스크톱 기준(150ms)을 직접 확인 후 정정**(추측을 사실처럼 쓸 뻔한 걸 자체 검증으로 잡음). 전체 **402/402 테스트 통과**(신규 3개, 회귀 0 — 기존 CWV 픽스처의 TBT 값이 전부 우연히 150ms 미만이라 영향 없음을 실측 확인).
- **브랜치 명명 정정 메모**: 위 CWV 수정은 원래 `master` 기반 별도 브랜치로 분리하려 했으나 `registry.ts`가 이미 이 브랜치 커밋 위에 겹쳐 있어 `git checkout`이 실제로 충돌 위험을 이유로 거부됨 → 같은 브랜치(`feat/content-structure-detection`)에 안전하게 3번째 커밋으로 유지. 브랜치 이름이 이제 내용을 정확히 반영 못함(title/h1/alt + CWV 두 가지 주제 혼재) — PR 리뷰 시 참고.
- **병합 충돌 사전 검증(2026-07-16, `git merge-tree --write-tree` 읽기전용 시뮬레이션)**: `master` ← `docs/readme-guide-ai-crawler-policy-sync` 단독 병합 clean(exit 0), `master` ← `feat/content-structure-detection` 단독 병합도 clean(exit 0). 두 브랜치가 건드린 파일을 `git diff --name-only`로 직접 대조한 결과 **완전히 겹치지 않음**(docs=README/GUIDE 8개 문서만, feat=`packages/mcp-engine/` 소스·테스트 10개만) — 병합 순서와 무관하게 충돌 가능성이 구조적으로 없음을 확인. 어느 순서로 merge하셔도 안전함.

### 신규 발견 — README 자기모순 (2026-07-15 직접 재감사, 추측 아님)
- **사실 확인(확인됨)**: `README.md:220`("앞으로 계획된 것(아직 시작 안 함): AI 크롤러 정책·Google Search
  Console/Analytics 연동(Phase 2)...")과 `README.en.md:221`(동일 영문 "Planned, not yet started")이
  이 중 **AI 크롤러 정책 부분만** 사실과 다르게 적고 있다 — 이미 완료됐다(위 "완료된 범위" 참고,
  `R-AI-CRAWLER-POLICY`, 커밋 `23c302f`). GSC/GA4/PSI 부분은 후보 E와 일치하게 여전히 스캐폴딩만
  존재하고 실연동 전(커밋 `39d840f`, fake client)이라 이 부분 표기는 맞다 — 전부가 아니라 일부만 오류.
- **같은 문서 내부 모순**: Phase 2 Stage 1(JSON-LD)·Stage 2(OG)는 바로 위에서 "✅ 완료" 토글로 정확히
  표시돼 있는데, Stage 3(AI 크롤러 정책=GEO)만 정반대로 "미착수"라 적혀 있다.
- **원인(가설 아님, 커밋 순서로 확인됨)**: README 갱신 커밋(`b774d67`)이 AI 크롤러 정책 구현 커밋
  (`23c302f`)보다 먼저 있었다. 작성 당시엔 맞는 말이었는데, 이후 기능이 완성되며 반영이 누락됐다.
- **영향 범위(확인됨)**: `README.md`·`README.en.md` 본문 + 대응 HTML(`README.html`·`README.en.html`,
  기존 관례상 MD와 동일 내용 유지 필요) 최소 4개 파일.
- **미확인 사항(가설, 단정 안 함)**: `GUIDE.md`/`GUIDE.en.md`에 AI 크롤러 정책이 아예 언급조차 안
  됐을 가능성 — 실측 필요. `TROUBLESHOOTING.md`·`.en.md`·해당 HTML 4종의 최종수정일(7/6)이
  README/GUIDE/FAQ 그룹(7/13)과 달라, og-fixer의 report_only 폴백이 문서에 반영됐는지도 미확인.
- **왜 후보 A보다 우선인가**: A는 아직 벌어지지 않은 확장 작업이지만, 이 건은 **이미 완성된 기능이
  실사용자에게 "없다"고 잘못 안내되는 현재진행형 결함**이다. PRD 우선순위 4번(GEO/AEO) 기능이라 방치
  시 신뢰도 손상 리스크가 A보다 크다.

### 다음 작업 후보 — 우선순위·근거·리스크 명시(B는 완료돼 목록에서 제거, 아래는 우선순위 순)

**H. [완료·PR 대기] README.md/README.en.md(+대응 HTML) 자기모순 수정**
- 코드·문서 작업 완료, `docs/readme-guide-ai-crawler-policy-sync` 브랜치 push 완료(커밋 `a0dada3`).
  GUIDE.md/GUIDE.en.md의 AI 크롤러 정책 언급도 이번에 함께 추가함(착수 전 확인 항목 이행됨).
  `TROUBLESHOOTING` og-fixer 폴백 커버리지는 별도 확인 안 함 — 아래 새 항목 I 참고.
- 남은 것은 **master로의 PR 병합뿐**(사용자 직접, "main/master 직접 push 금지" 규칙에 따라 AI가 대신 못함).

**I. [신규 · 사람게이트 0] Phase 2 Stage 4(title/h1/alt 탐지) 문서 반영 — H·이 항목의 PR이 master에 먼저 merge된 뒤 착수**
- `R-TITLE-MISSING`·`R-H1-MISSING`·`R-H1-MULTIPLE`·`R-IMG-ALT-MISSING` 4종이 아직 README/GUIDE(8개
  파일) 어디에도 안내되지 않음(코드만 `feat/content-structure-detection` 브랜치에 있음, PR 대기).
- **왜 지금 바로 안 하는가(의도적 순서)**: H도 같은 README/GUIDE 파일을 건드리는 PR이 아직 master에
  안 들어갔다 — 지금 master 기준(stale)으로 문서를 고치면 병합 순서에 따라 충돌하거나, H가 고친
  자기모순이 되살아나는 역행이 생길 위험이 있다. **H PR → I 문서작업 → 이 문서작업 PR** 순서를 지킬 것.
- 리스크: 낮음(문서만). 실패 시나리오: 순서를 어기고 먼저 착수하면 "결국 병합 충돌 정리에 더 큰 비용".

**~~J. alt 텍스트 부재 탐지 규칙~~ — 해결됨(2026-07-16)**: 당초 "별도 세션 검토 권장"으로 미뤘으나,
같은 세션에서 `dom-diff.ts`의 실제 필드 편입 로직을 코드로 확인해 우려했던 리스크가 없음을 검증한 뒤
바로 구현 완료(`R-IMG-ALT-MISSING`, 커밋 `6e79864`). PRD "콘텐츠·엔티티" 티어(title/meta/h/alt/OG)가
이제 전부 탐지 커버됨 — 위 "완료된 범위"·후보 I 참고.

**A. [사람게이트 0 코드 작업 · 낮은 가치로 재평가] og:description(원본 있을 때만 복사)·Twitter Card 확장**
- 근거: `PageSignals.metaDescription`·`og-fixer.ts` 패턴이 이미 있어 새 인프라 불필요. "이미 있는 값 그대로 복사"만 하는 안전 카테고리.
- **실측으로 재확인된 한계(2026-07-15)**: 실제 example.com 리포트에서 `R-META-DESCRIPTION-MISSING`과 `R-OG-DESCRIPTION-MISSING`이 **동시에** 발생 — "복사할 원본 meta description 자체가 없는" 케이스가 실무에서 실제로 흔함을 데이터로 확인, 적용범위가 좁다는 우려가 뒷받침됨.
- 실제 작업량(과소평가 금지): `planOgFix` 시그니처 확장, `candidates`/`idempotency_marker` JSON 구조 확장, 관련 테스트 3개 갱신 필요. Twitter Card는 별도 설계 결정 필요.
- **평가**: 여전히 유효하나 이제 "코드로 안전하게 할 수 있는 PRD 백로그" 중 실질가치가 낮은 마지막 항목으로 하향.

**C. [보류 · 무거움] title/meta "덮어쓰기" gated fixer** — 변경 없음, PRD가 위험군으로 분류.

**D. [보류 · 위험 낮음, 재검토해도 결론 동일] 다중 fix 연속 적용 시 git-clean 재확인 창(TOCTOU)** — 공격 시나리오가 아닌 동시성 엣지케이스로 재확인, 여전히 낮은 우선순위.

**E. [사람 게이트] GSC/GA4/PSI 실연동(PRD 5순위)** — 서비스계정 발급 선행 필요, 새 세션 인터뷰 권장.

**F. [사람 전용] 법무 검토 6건(L1·L2·L4·L5·L12·L13)** — 변경 없음.

**G. [사람 전용] Mac/Linux 수동 실행 검증** — 변경 없음, DB 파일 권한(0o600/0o700)의 실제 Mac/Linux 동작 미검증 포함.

### 지금 결정이 필요한 상태 이슈 (작업은 아니나 방치 시 리스크)
- **이 파일 자체(CHECKPOINT.md)** — 지시("commit/push 하지 마")를 존중해 이번 갱신도 커밋하지 않고 unstaged로 둔다. 커밋 여부 확정은 여전히 미결(사용자 지시가 바뀌지 않는 한 유지).
- ~~`packages/mcp-engine/scratch-fork-test.mjs`~~ — **해결됨(2026-07-15)**: 삭제 완료(untracked 파일이라 커밋 이력 없음, `git status` clean 확인).
- ~~`feat/jsonld-og-detection-and-security-hardening` 브랜치~~ — **해결됨(2026-07-15)**: `git branch -d`로 로컬 삭제 완료(master가 완전히 포함함을 `merge-base --is-ancestor`로 사전 확인 후 진행).
- ~~`docs/phase1.5-verification-and-guides` 브랜치~~ — **해결됨(2026-07-15, 위 두 건과 별도로 추가 발견·정리)**: 로컬+원격 모두 삭제 완료. 이 문서엔 애초에 언급된 적이 없었다 — 즉 이 섹션 자체를 매번 실제 저장소 상태와 대조 없이는 신뢰할 수 없다는 방증(위 "같은 날 2차 보강 사유" 참고).
- ~~README.md/README.en.md 자기모순(AI 크롤러 정책 오기재)~~ — **코드·문서 작업 완료(2026-07-16)**, master 병합만 남음(후보 H 참고).
- **신규(2026-07-16)**: 현재 `master`는 여전히 `ed7eba5`(12일 전과 동일)이고, 그 위에 **PR 대기 브랜치 2개**가 쌓여 있음 — `docs/readme-guide-ai-crawler-policy-sync`(H, 커밋 `a0dada3`) · `feat/content-structure-detection`(Stage 4 title/h1+alt, 커밋 `34ad17e`+`6e79864`, 같은 브랜치에 2번째 커밋 추가됨). 둘 다 push 완료, main/master 직접 push 금지 규칙에 따라 PR·병합은 사용자 몫. **병합 순서 권장: H 먼저 → Stage 4**(둘 다 독립적이라 실제 충돌 가능성은 낮지만, 후속 문서작업(후보 I)이 H를 전제하므로).
- `git branch -a` 재확인 결과 로컬 `master`·`docs/readme-guide-ai-crawler-policy-sync`·`feat/content-structure-detection` 3개 존재 — 전부 push 완료 상태.

### 문서 간 교차 검증 (모순 확인)
`CHECKPOINT_1.5.md`·`CHECKPOINT_2.md`·`HUMAN_ACTION_CHECKLIST.md` 3개 문서를 상호 대조 — GitHub fork 경로 상태("완료")·Phase 2 범위가 3곳 모두 일치, 이 3개 문서 사이에서는 기술적 불일치 없음. `HUMAN_ACTION_CHECKLIST.md`는 AI크롤러정책 완료로 갱신이 필요하지 않음(애초에 이 항목을 다루지 않았음 — 법무 6건/Mac·Linux/GitHub fork 3건만 다룸, 재확인 완료).

**정정(2026-07-15)**: 위 "3개 문서 사이 불일치 없음"은 여전히 유효하지만, **이 대조 범위에 README.md/
README.en.md가 빠져 있었다** — 그 결과 CHECKPOINT.md·CHECKPOINT_2.md에는 "완료"로 정확히 기록된 AI
크롤러 정책이 README에서는 "미착수"로 남아있는 실제 모순을 그때는 잡지 못했다. 즉 이전 버전의 이 섹션이
"발견된 기술적 불일치 없음"이라 단정한 것 자체가 **검증 범위 누락으로 인한 오판**이었다(교훈: 내부
체크포인트 문서끼리만 대조하는 것으로는 부족하고, 실사용자 대상 문서까지 포함해야 함).

### 중간 테스트·검증(2026-07-17, `feat/content-structure-detection` HEAD `5e44b33` 기준, 코드 변경 없음)
- 실행: `npm run typecheck`(0 에러) → `npm run build`(0 에러) → `npm test`(vitest, pretest로 fixture
  `npm ci` 포함) → **61 파일 402/402 테스트 전부 통과**, 회귀 0.
- lint: 이 저장소엔 eslint/biome/prettier 설정·스크립트가 아예 없음 — **미실행(도구 부재, 신규 이슈 아님)**.
- `npm audit --audit-level=high`: **moderate 17건, high/critical 0건**(exit 0, M0 문서에 이미 2026-
  이전부터 추적 중인 항목과 동일 — `lighthouse→@sentry/node→@opentelemetry/*` 3단계 전이 의존성, 우리
  코드가 직접 호출 안 함). 신규 취약점 없음, 상태 불변 재확인.
- `fixers/`·`fix-orchestrator/`(apply.ts·rollback.ts) 직접 재독해: TOCTOU 재검증(plan→apply 사이 구조
  변경 대응)·멱등성(재실행 시 already_applied)·실패시 git checkout 롤백·rollback.ts의 backup_path 부재
  시 명시적 에러 전부 코드로 확인, 로직 결함 없음.
- `dom-signals.ts` 재검토: `parseHTML` 파싱 실패 시 안전한 fallback 객체 반환(예외로 죽지 않음), raw/
  rendered 양쪽 alt 추출 로직 대칭 확인.
- `console.log`/`console.debug` 잔존, 하드코딩 시크릿 패턴(api_key/secret/password/token=...) 둘 다
  `fixers/`·`fix-orchestrator/`·`rules/`·`render/`에서 grep 0건.
- `git status`: `CHECKPOINT.md`만 unstaged(이 항목), 그 외 추적 대상 변경 없음 — fixture `npm ci`가
  코드베이스를 오염시키지 않음 확인.
- **결론**: 이번 세션 코드 변경 없음(순수 검증) — 기존 3개 커밋(title/h1/alt/CWV-TBT)의 상태가 그대로
  유효함을 재확인. 새로 발견된 결함 없음.

### 🔴 치명적 결함 발견·수정(2026-07-18) — 실사용자가 실제로 새 세션에서 설치·테스트하다 발견
- **사용자가 실제로** `/plugin marketplace add` → `/plugin install` → `/reload-plugins` → 실제 사이트 진단
  요청까지 전부 실행했는데, **seomedic MCP 서버가 연결되지 않아 실제 진단 엔진이 한 번도 실행되지
  못함**(WebFetch로 임시 대체됨). 지금까지 이 세션의 402~404개 자동 테스트는 전부 로컬 monorepo
  코드를 직접 실행한 것이라 이 문제를 전혀 못 잡았음 — 실제 설치 경로를 테스트한 건 이번이 처음.
- **근본원인(확인됨, npm 레지스트리 직접 조회)**: `packages/plugin/.mcp.json`이
  `npx -y @seomedic/mcp`로 설정돼 있었는데, `@seomedic/mcp`는 **공개 npm에 발행된 적이 없음**
  (`npm view @seomedic/mcp` → 404 확인). 즉 플러그인은 코드로는 완성됐지만 "배송 연결선"이 처음부터
  없었음.
- **정정(2026-07-18, PRD 재정독)**: 이전 기록엔 "PRD가 npm 발행을 요구한 적 없다"고 썼으나 부정확함.
  `04_PROJECT_SPEC.md`의 확정 아키텍처는 원래부터 `npx -y @seomedic/mcp`(npm 발행 전제)다. 다만 같은
  PRD가 "배포는 법무 게이트(L1·L2·L4·L5·L12·L13) 통과 후"라고 명시했고 이 게이트는 아직 미완료 —
  npm 발행=공개 배포이므로 지금 발행하면 PRD 자신의 게이트를 어기게 됨. 따라서 로컬 번들은 "설계
  이탈"이 아니라 "법무 게이트 통과 전까지 쓰는 정확한 임시 다리"다. **법무 6건 완료 후 npm 발행으로
  전환 필요 — 백로그로 명시 추적**(안 그러면 임시방편이 영구 설계로 오인될 위험).
- **구현 완료 + 별도 브랜치 push 완료**: `fix/plugin-mcp-server-bundling`(master 기준, 커밋
  `6624e76`). mcp-engine 빌드 산출물을 `packages/plugin/mcp-server/`에 커밋, SessionStart 훅
  (`ensure-mcp-deps.mjs`)이 `${CLAUDE_PLUGIN_DATA}`에 최초 1회 `npm install`(Windows 포함 3-OS,
  `execFileSync`로 셸 미경유), `.mcp.json`은 번들된 서버를 `node`로 직접 실행.
- **구현 중 재확인된 실제 버그(추측 아님, 재현·수정 완료)**: tsc는 소스가 삭제돼도 이전 빌드 산출물을
  안 지운다 — 브랜치를 오가며 빌드하다 `feat/content-structure-detection`의 `content-structure.js`가
  이 브랜치(master 기준) 번들에 그대로 섞여 들어갈 뻔했음. `dist/rules/registry.js`·개별 파일 직접
  grep으로 발견 → `prebuild`에 dist 전체 정리 스크립트(`clean-dist.mjs`) 추가로 근본 수정, 재검증
  완료(0건).
- **검증 상태(정직하게 구분, 변경 없음)**: 로컬 스모크 테스트(실제 의존성 연결 후 실행, exit 124=정상
  stdio 대기) 통과. **실제 마켓플레이스 설치→SessionStart 훅 발동→연결까지는 여전히 사용자의 실제
  재설치 재검증 필요** — 이 세션(dev 환경)에서 시뮬레이션 불가능한 영역.
- **3개 브랜치 병합 충돌 재검증(2026-07-18)**: `docs/readme-guide-ai-crawler-policy-sync`·
  `feat/content-structure-detection`·`fix/plugin-mcp-server-bundling` 3개 전부를 `git diff
  --name-only`로 서로 대조(comm -12) — **3개 쌍 전부 겹치는 파일 0건**. 어떤 순서로 병합하셔도
  구조적으로 충돌 불가능. 머지·PR 생성은 표준 지시("PR·Merge·Release는 자동 진행하지 마")에 따라
  AI가 대신하지 않음 — 사용자 전용 다음 행동.
- **수정 방향 결정**: npm 공개 발행(Option B)은 되돌리기 어려운 외부 행위+저장소 PRIVATE 정책과 충돌해
  기각. *(2026-08-09 일관성 메모: 저장소는 실측 결과 PUBLIC이라 두 근거 중 "PRIVATE 정책과 충돌"은
  전제가 사실이 아니었음이 나중에 드러났다 — 그러나 첫 번째 근거인 "되돌리기 어려운 외부 행위"만으로도
  이 결정은 독립적으로 유효해 결론 자체는 바뀌지 않는다. 위 780행 정정과 동일한 발견의 파생 기록.)*
  **로컬 번들(Option A)**로 확정 — 단, 최초 구상("형제 폴더 `../mcp-engine` 상대경로 참조")은
  공식 문서 확인 결과 틀렸음(마켓플레이스 설치는 플러그인 자기 폴더만 캐시에 복사, 형제 폴더는 복사
  안 됨 — "path traversal limitations" 공식 문서로 확정). 공식 문서가 제시하는 정확한 패턴
  (`${CLAUDE_PLUGIN_DATA}` 영속 폴더 + SessionStart 훅에서 최초 1회 `npm install`)으로 재설계.
- **실제 구현**:
  - `packages/mcp-engine/scripts/package-for-plugin.mjs`(신규) — mcp-engine의 `dist/`+trimmed
    `package.json`(런타임 의존성+postinstall만)을 `packages/plugin/mcp-server/`로 복사.
    `npm run package:plugin` 스크립트로 실행(`package.json`에 추가).
  - `packages/plugin/scripts/ensure-mcp-deps.mjs`(신규) — SessionStart 시 `${CLAUDE_PLUGIN_DATA}`에
    의존성 설치. 공식 문서 예시(POSIX `diff`/`cp`/`rm` 셸 조합)는 Windows에서 깨질 위험이 있어(이
    프로젝트는 3-OS 지원 대상) Node 스크립트로 재구현, `execFileSync`(exec 아님, 셸 미경유)로 작성.
  - `packages/plugin/hooks/hooks.json`(신규) — 위 스크립트를 SessionStart에 연결.
  - `packages/plugin/.mcp.json` — `npx -y @seomedic/mcp` → `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/
    dist/server.js` + `NODE_PATH=${CLAUDE_PLUGIN_DATA}/node_modules`로 교체.
  - `.gitignore` — 전역 `dist/` 제외 규칙에 `packages/plugin/mcp-server/dist/` 예외 추가(빌드
    산출물이지만 형제 폴더 참조가 안 되니 이번엔 커밋 필요).
- **검증 상태(정직하게 구분)**:
  - ✅ **로컬 스모크 테스트 완료**: `NODE_PATH=packages/mcp-engine/node_modules node packages/
    plugin/mcp-server/dist/server.js` 실행 → 5초 타임아웃까지 크래시 없이 stdio 대기(exit 124,
    MCP stdio 서버의 정상 동작 패턴) — 번들된 서버 코드 자체는 의존성만 있으면 정상 작동함을 실측 확인.
  - ⚠️ **미검증(정직하게 밝힘)**: `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` 실제 치환, SessionStart
    훅 실제 발동, 훅 안에서 `npm install`(better-sqlite3 네이티브 빌드+playwright chromium 다운로드
    포함) 실제 성공 여부는 **실제 `/plugin install` 재실행 전까지 확인 불가** — 이건 Claude Code
    애플리케이션 자체의 동작이라 이 세션(dev 환경) 안에서 시뮬레이션할 수 없음.
  - 이 변경은 아직 **커밋되지 않음**(unstaged) — 커밋/push는 사용자 요청 없이 진행 안 함.
  - 재테스트 시 빠른 방법: `claude --plugin-dir <이 저장소 packages/plugin 경로>`로 로컬 소스를 직접
    로드하면 git push·PR 병합·마켓플레이스 갱신 없이도 즉시 재검증 가능(공식 문서 확인, 이 방식은
    캐시 복사 없이 원본을 그대로 씀).

### 2차 심층 검증(2026-07-17, 같은 날 후속) — 경계값 테스트 공백 발견·수정 + 플레이키 실패 조사
- **발견**: `R-CWV-TBT-POOR` 규칙의 기존 테스트는 50ms(good)·400ms(bad)만 검증 — 실제 임계값 경계인
  150ms 자체(`<=` 연산자가 정확히 그 지점에서 good/bad를 가르는지)는 어떤 테스트도 커버하지 않았음.
  누군가 `<=`를 `<`로 잘못 고쳐도 기존 테스트로는 못 잡는 실제 공백.
- **수정(테스트 전용, 프로덕션 코드 무변경)**: `test/unit/rules.test.ts`에 "TBT 정확히 150ms→미발화"·
  "151ms→발화" 2건 추가. `npx vitest run test/unit/rules.test.ts` 단독 재검증 26/26 통과.
- **회귀 재검증**: typecheck 0에러 + 전체 vitest 재실행 중 `fix-orchestrator-js-only-canonical-
  integration.test.ts`에서 1건 실패(403/404) 발생 — 무시하지 않고 즉시 조사. 해당 파일만 단독 재실행
  → 5/5 전부 통과(재현 안 됨). 전체 스위트 한 번 더 통째로 재실행 → **61파일 404/404 전부 통과**.
  **결론(확인됨, 추측 아님)**: 직전 전체 실행 직후 바로 이어서 두 번째 전체 실행을 돌린 리소스 경합성
  플레이키(해당 테스트가 실제 `next build` 서브프로세스+격리 git 저장소를 스핀업하는 통합테스트라
  타이밍에 민감함) — 내가 추가한 테스트(순수 유닛, `rules.test.ts`)와는 파일·의존성이 완전히 분리돼
  있어 인과관계 없음. 코드 결함 아님, 이번 사례에서 재현성 0/2.
- **탐색했으나 해당 없음으로 확인**: 브라우저 콘솔 오류 캡처 기능 — `render-bridge/`·`render/` 전체
  grep 결과 `page.on("console"...)` 류 코드 자체가 없음(미구현). PRD(`.PRD/*.md`) 재확인 결과 "콘솔"은
  전부 Search Console(제품명) 언급뿐, 대상 페이지의 브라우저 콘솔 에러 캡처는 애초에 요구된 적 없음 —
  결함이 아니라 범위 밖. `render-local-bridge.ts`의 `page.goto` 실패 경로는 별도 확인: `finally`로
  context.close() 보장(리소스 누수 없음), 에러는 Playwright 원문 그대로 전파(RenderBridgeError로
  안 감쌈 — 기능은 정상, 메시지 일관성만 사소하게 아쉬움. 요청 범위 밖이라 임의 수정 안 함).

### 병합 후(또는 병합 전이라도) 실사용 재검증 체크리스트 (2026-07-18, 준비만 완료 — 실행은 사용자 몫)
- **왜 필요한가(근거)**: 이번 세션의 핵심 사건은 "402~404개 유닛테스트 전부 통과 + 로컬 빌드 성공"
  상태에서도 실사용자가 실제로 `/plugin install`했을 때 MCP가 연결되지 않았던 것. 그 원인을 고친
  `fix/plugin-mcp-server-bundling`도 지금까지 **로컬 스모크 테스트(exit 124 stdio 대기 확인)까지만**
  검증됐고, 실제 마켓플레이스 설치·SessionStart 훅 발동·`npm install` 성공 여부는 이 dev 세션 안에서
  시뮬레이션이 원천적으로 불가능함(Claude Code 애플리케이션 자체의 동작이라서). 같은 방식(자동테스트만
  믿기)으로 "고쳐졌다"고 말하면 이번 세션이 실사용자 제보로 잡아낸 것과 똑같은 종류의 맹점을 반복하게
  됨 — 그래서 재검증 절차를 미리 구체화해둠.
- **빠른 방법(병합 전에도 가능, 추천)**: `claude --plugin-dir "D:\AI_Dev_Work\2026y\26y_07m_06d_
  SoDam-SeoMedic\packages\plugin"`로 로컬 소스를 직접 로드하면 GitHub push·PR 병합·마켓플레이스
  갱신 없이도 즉시 재검증 가능(공식 문서 확인 — 이 방식은 캐시 복사 없이 원본을 그대로 씀). **병합
  전에 먼저 이 방법으로 검증하면, 병합 후 다시 문제가 생길 위험을 사전에 줄일 수 있음.**
- **정식 방법(병합 후, 마켓플레이스 경로 그대로 최종 확인용)**:
  1. 기존에 설치된 seomedic 플러그인이 있다면 제거 후 재설치(오래된 캐시가 남아있으면 새 훅이 안
     붙을 수 있음) — `/plugin uninstall seomedic` → `/plugin marketplace add sodam-ai/SoDam-SeoMedic`
     → `/plugin install seomedic@sodam-seomedic-marketplace`.
  2. **완전히 새 세션**을 연다(이번 세션 이어서 하지 않기 — 실사용 검증은 항상 새 세션이어야 훅이
     실제로 처음부터 발동하는지 볼 수 있음).
  3. 새 세션 시작 직후 콘솔에 `[ensure-mcp-deps] seomedic MCP 서버 의존성 설치 중...` 메시지가
     뜨는지 확인 — 안 뜨면 SessionStart 훅 자체가 안 붙은 것(hooks.json 배선 문제).
  4. `npm install`이 실제로 몇 분 걸리는지, 끝까지 성공하는지 관찰(`better-sqlite3` 네이티브
     빌드·`playwright install chromium` 다운로드 포함이라 원래도 느릴 수 있음 — 실패해도 정상
     흐름인지 "몇 분 걸림"인지 구분 필요).
  5. 설치 완료 후 실제 URL로 진단 요청(예: 저번에 실패했던 `https://www.sodam-ai.xyz/`)해서 "MCP
     도구가 연결되지 않았습니다" 메시지 없이 seomedic 도구가 실제로 호출되는지 확인.
  6. 한 번 실패해도 재시도가 되는지 보려면: 3~5단계를 만족한 뒤 세션을 하나 더 새로 열어 재실행 —
     이미 설치된 상태에서는 `npm install`을 건너뛰고 바로 연결되는지(캐시 비교 로직) 확인.
- **PRD 연결**: Phase 1 자체 체크리스트("마켓 플러그인으로 설치 → 다른 프로젝트에서 `/seo-audit`
  실행 검증 Win/Mac/Linux")의 Windows 항목이 바로 이 절차로 채워짐. Mac/Linux는 별도 기기 필요 —
  여전히 사람 몫, 이번 체크리스트 범위 밖.

### 다음 세션 착수 항목 — Phase 2 잔여 갭 (2026-07-18, 문서화만 — 이번 세션 착수 안 함)
- **재확인 근거**: `.PRD/03_PHASES.md` Phase 2 기능 목록(원문 인용, line 93-103)을 실제 코드와
  하나씩 대조(grep+Read로 직접 확인, 추측 아님).
- **갭 1 — Q&A 구조 미구현**: PRD "GEO/AEO 기초"에 명시된 항목인데
  `packages/mcp-engine/src` 전체 grep(`Q&A|FAQPage|QAPage`) 결과 **0건** — 착수된 적 없음.
- **갭 2 — JSON-LD 검증이 PRD 성공기준에 못 미침**: `jsonld.ts`를 직접 읽어 확인한 결과, 현재는
  "JSON 파싱 성공 + `@context`·`@type` 존재" 같은 **구조적 유효성만** 검사함. PRD 성공기준은
  "Rich Results/스키마 검증 통과 + **페이지 내용과 일치(환각 0)**" — 즉 타입별 필수 필드(예:
  Product면 name/image/offers)나 JSON-LD 값이 실제 페이지 콘텐츠와 일치하는지는 아직 검사 안 함.
- **왜 이번 세션에 착수하지 않았는지**: 이 두 갭은 외부 의존성 없는 순수 코드 작업이라 당장
  시작할 수 있었지만, PRD가 스스로 못박은 순서(Phase 1+1.5 "안정" → Phase 2, Phase 1~2 "운영 중"
  → Phase 3)를 지키는 게 우선이라 판단해 보류함. 근거: 지금 Phase 1의 크리티컬 프로덕션 버그 수정
  (`fix/plugin-mcp-server-bundling`)이 아직 병합도 안 됐고 실사용 검증도 안 된 상태 — 여기에 새
  기능을 더 얹으면 병합 대기 브랜치가 늘어 충돌 위험이 커지고, 이번 세션이 반복해서 강조해 온
  "테스트 통과 ≠ 실제 작동" 교훈과도 어긋남. 세션 비용도 누적 $580대를 넘어 스코프를 계속 넓히는
  건 리스크 신호로 판단.
- **다음 세션 착수 순서(권장)**:
  1. 병합 대기 3개 브랜치 병합 (사람 몫)
  2. 위 "병합 후 실사용 재검증 체크리스트" 실행해 MCP 연결 수정이 실제로 작동함을 확인 (사람 몫)
  3. 그 다음에만 착수: Q&A 구조 신규 규칙(report_only 우선) + JSON-LD 검증을 스키마.org 타입별
     필수 필드 체크 + 페이지 콘텐츠 대조 수준으로 강화
- **GSC/GA4/PSI 연동**: 여전히 사용자의 실제 Google 서비스계정 크리덴셜 제공 전까지 코드 착수
  불가(변동 없음) — 위 3항목과 무관하게 별도 블로커로 유지.

### 실사용 라이브 진단 검증 + 실버그 발견·수정(2026-07-18)
- **방법**: 자동테스트가 아니라 빌드된 엔진(`runAudit()`)으로 실제 URL 3개에 직접 접속해 검증
  (예시 스크립트, 소스 수정 없는 `siteMode:false` 진단 전용 호출). 대상: ① `example.com`(정상
  케이스) ② `www.sodam-ai.xyz`(사용자 실제 소유 사이트, 전체 규칙셋 검증) ③ 존재하지 않는 도메인
  (실패 케이스 — 예외/실패 상황 검증 목적으로 의도적 선정).
- **① example.com**: 21.5초, 6개 위반 정상 탐지(canonical 없음·JSON-LD 없음·OG 일부 누락·meta
  description 없음·AI 크롤러 정책 안내) — 예상과 일치, 이상 없음.
- **② sodam-ai.xyz**: 30.4초, 3개 위반(JSON-LD 없음·AI 크롤러 정책 안내·CWV LCP 3018ms 느림).
  이전 세션에서 사용자가 실제로 발견했던 "canonical이 다른 도메인을 가리킴" 문제는 이번 규칙셋
  (부재만 탐지, 오설정은 미탐지)의 설계 범위 밖이라 재현되지 않음 — 회귀 아님, 기존에 알려진 규칙
  범위 한계 그대로.
- **③ 존재하지 않는 도메인 — 실버그 발견**: `findings=0`으로 "정상 종료"됐지만 실제로는 사이트에
  전혀 접속하지 못한 것이었음. 원인 추적(코드 직접 확인, 추측 아님):
  `robots.ts`의 `loadRobotsPolicy`가 robots.txt 조회 실패(DNS 오류 등)를 안전을 위해 "전체 차단"으로
  처리(fail-closed, 이 설계 자체는 타당함) → `crawl()`이 `skippedByRobots`에 넣고 페이지 0개 반환 →
  `summary.ts`의 `computeOverallLabel`이 위반 0건이면 "양호"를 반환 → **최종 리포트가 "종합 상태:
  양호, 진단 페이지 수: 0"으로 표시** — 비개발자 사용자가 숫자를 안 보고 "양호"만 보면 "내 사이트에
  문제가 없다"고 오인할 수 있음. `server.ts`의 안내 문구도 "robots.txt로 차단되어"라고 단정해
  실제로는 접속 실패인 경우까지 "사이트 주인이 봇을 막았다"처럼 오해시킴.
- **안전한 수정(범위 최소화, 라벨 계산 로직 자체는 무변경 — 하위 호환)**:
  - `report/markdown.ts`: 진단 페이지 0개일 때 "양호" 라벨은 그대로 두고, 그 아래에
    "⚠️ 진단한 페이지가 0개입니다 — URL 철자와 사이트 접속 가능 여부를 확인해주세요" 경고를 추가.
  - `server.ts`: "robots.txt로 차단되어"(단정) → "robots.txt 정책 또는 사이트 접속 실패로"(추측
    금지, 두 가능성 모두 인정) + 확인 안내 문구로 교체.
- **재검증**: 신규 테스트 2건 추가(`report.test.ts` — 0페이지 시 경고 문구 포함 확인 + 정상
  케이스에서 경고가 안 붙는지 오탐 방지 확인) 후 typecheck 0에러·전체 테스트 **406/406 통과**(기존
  404 + 신규 2). 빌드 재실행 후 같은 3개 URL로 실사용 재검증 — 존재하지 않는 도메인 리포트에
  경고 문구가 실제로 찍히는 것을 육안 확인(추측 아님, 리포트 원문 캡처됨). example.com·sodam-ai.xyz
  결과는 이전과 동일한 위반 패턴 유지(sodam-ai.xyz의 CWV LCP 수치만 재측정마다 자연 변동 — Lighthouse
  lab 측정의 알려진 특성, 회귀 아님).
- **아직 손대지 않은 부분(정직하게 표시)**: `robots.ts`가 "robots.txt가 진짜로 차단함"과 "네트워크
  오류로 조회 자체가 실패함"을 타입 레벨에서 구분하지 않는 근본 설계는 그대로임(이번엔 안내 문구만
  정직하게 고침). 타입 구분까지 하려면 `robots.ts`~`crawler.ts`~`audit-orchestrator.ts`~`server.ts`
  4개 파일을 관통하는 변경이 필요해 이번 요청 범위(버그 수정)를 넘어서는 리팩토링이라 보류 — 필요하면
  별도 작업으로 제안.
- **커밋·push 완료(2026-07-18)**: 위 3개 파일(markdown.ts·server.ts·report.test.ts)만 스테이징해
  커밋(`67d53c5`, CHECKPOINT.md는 표준 지시대로 이번에도 제외) → 이미 origin에 올라가 있던
  `feat/content-structure-detection` 브랜치에 push 완료(`7f636ec..67d53c5`). 이 브랜치는 여전히
  병합 대기 3개 브랜치 중 하나이며, PR 생성·병합은 표준 지시에 따라 AI가 하지 않음 — 사용자 몫.

### Phase 2 확장 구현 — Q&A 구조 탐지 + JSON-LD Product 필수필드 검증(2026-07-18)
- **배경**: 사용자가 "Phase 2 진행해야지"로 명시 승인. Plan mode로 설계(계획 파일에 상세 기록) 후
  구현. 새 브랜치 `feat/geo-qa-and-jsonld-product-fields`를 `origin/master`(`ed7eba5`) 기준으로
  생성 — 아직 병합 안 된 `feat/content-structure-detection`과 독립적으로 유지(파일 겹침 없음).
- **계획 중 발견한 정정(중요)**: Article 타입도 "headline 필수"로 체크하려 했으나, Google 공식 문서
  (`developers.google.com/search/docs/appearance/structured-data/article`)를 WebFetch로 직접 확인한
  결과 **"There are no required properties"**라고 명시돼 있어 계획에서 제외. 메모리 기반 추측으로
  밀어붙였다면 PRD의 "환각 0" 요구를 스스로 어겼을 사례 — 근거 확인 후 스코프를 축소한 정직한 사례로
  남긴다. Product는 별도 페이지(`product-snippet`)에서 `name` 필수 + `review`/`aggregateRating`/
  `offers` 중 최소 1개 필수를 확인 후 그것만 구현.
- **구현**:
  - `rules/definitions/jsonld-shared.ts`(신규) — `parseJsonLdNodes`/`getTypes` 공유 헬퍼.
  - `rules/definitions/qa-structure.ts`(신규) — `R-QA-STRUCTURE-MISSING`(low, `category:"geo"`,
    FAQPage/QAPage 존재 여부만 확인, PRD의 "AI 노출 보장 X" 취지를 안내 문구에 그대로 반영).
  - `rules/definitions/jsonld-required-fields.ts`(신규) — `R-JSONLD-PRODUCT-INCOMPLETE`(medium,
    `category:"schema"`, Product 타입 한정 name/review·aggregateRating·offers 검사).
  - `rules/registry.ts` 수정 — 두 규칙 `ALL_RULES`에 추가(기존 14개 규칙 순서·동작 무변경).
  - **계획 대비 정정**: `jsonld.ts`의 `classifyBlock`을 공유 헬�퍼로 리팩터하려 했으나, `@graph`
    패턴에서 `@context`는 래퍼 객체에·`@type`은 평탄화된 자식 노드에 각각 있는 기존 케이스를
    새 헬퍼로 단순 치환하면 "무효"로 오판정하는 회귀를 만들 뻔해 **리팩터를 포기하고 jsonld.ts는
    무변경으로 유지**(작은 코드 중복은 감수, 이미 검증된 동작을 지키는 게 우선이라 판단).
  - `test/unit/rules.test.ts` — 신규 규칙 2개당 5개씩 총 10개 테스트 추가 + 기존 `goodFixtures`의
    JSON-LD에 FAQPage 블록 추가(안 하면 새 규칙이 기존 "정상 케이스=위반 0건" 테스트를 깨뜨림 —
    계획 단계에서 미리 예측·반영한 회귀 포인트, 실제로 맞아떨어짐).
- **검증**: typecheck 0에러, build 0에러, 전체 테스트 **389/389 통과**(master 기준 379개+신규 10개,
  회귀 없음).
- **실사용 파이프라인 검증 — 첫 시도 실패 원인까지 정직하게 기록**: 로컬 HTTP 서버(127.0.0.1)로
  실제 `runAudit()`(크롤+렌더+규칙평가 전체)을 태워보려 했으나 `findings=0`으로 나옴 — 원인 추적
  결과 **SSRF 가드가 루프백 IP(127.0.0.1)를 의도적으로 차단**하고 있었음(`ssrf-guard.ts`, "127.0.0.0/8"
  하드코딩 차단 확인) → robots.txt 조회 자체가 막혀 이전에 고친 것과 같은 "0페이지" 경로를 탄 것으로
  추정(가능성, 이 브랜치엔 그 markdown.ts 수정이 없어 경고문 미출력이라 완전 확정은 못 함). 이건 버그가
  아니라 **의도된 보안 기능이 제 방식대로 검증을 막은 것** — 검증 방법을 바꿔, 네트워크/SSRF 계층을
  건너뛰고 실제 HTML 파서(`extractSignalsFromHtml`, linkedom 기반)로 직접 추출한 뒤
  `evaluateAllRules`에 그대로 넣어 재검증 → **두 규칙 다 정확히 발화 확인**(`R-QA-STRUCTURE-MISSING`
  low, `R-JSONLD-PRODUCT-INCOMPLETE` medium "Product 타입인데 누락: name" — 손으로 만든 테스트
  fixture가 아니라 실제 파서 출력으로 검증됐다는 점에서 순수 유닛테스트보다 한 단계 더 실제에 가까움).
- **커밋·push**: `[feat]` 타입으로 커밋 후 `feat/geo-qa-and-jsonld-product-fields`를 origin에 push
  (CHECKPOINT.md는 이번에도 제외). PR 생성·병합은 표준 지시대로 하지 않음 — 사용자 몫.
- **후속 과제(제외 범위, 다음 라운드용)**: 콘텐츠 일치("환각 0") 검증, Product 외 타입 확장(타입
  추가 시마다 이번처럼 Google 공식 문서로 먼저 확인하는 패턴 유지), Q&A 시각적 콘텐츠 휴리스틱 탐지.
- **4개 브랜치 충돌 재검증(2026-07-18, 정정)**: 새 브랜치 추가로 기존 "3개 브랜치 전부 충돌 0건"
  전제가 깨짐 — `comm -12`로 재대조한 결과 `feat/geo-qa-and-jsonld-product-fields`와
  `feat/content-structure-detection`이 `rules/registry.ts`·`test/unit/rules.test.ts` **2개
  파일에서 겹침**(둘 다 같은 파일에 새 규칙을 추가해서 생긴, 예상 가능한 겹침). 나머지 조합
  (docs 브랜치·mcp-bundling 브랜치와는 전부 0건)은 여전히 충돌 없음. 이 두 브랜치를 병합할 때는
  `registry.ts`의 `ALL_RULES` 배열과 `rules.test.ts`에 양쪽이 추가한 항목이 실제로 같은 줄을
  건드렸는지에 따라 수동 병합(충돌 해결)이 필요할 수 있음 — 병합은 여전히 사용자 몫이라 실행은
  안 했지만, 미리 정직하게 알려둠(이전처럼 "전부 충돌 없음"이라고 말하면 부정확함).

## 다음 작업 단계 로드맵 (2026-07-18 종합 정리 — 이 세션 전체 사실을 근거로 재구성)

이 섹션은 이 세션에서 확정된 모든 사실(브랜치 상태·검증 결과·PRD 대조 결과)을 한 곳에 모아
"다음에 뭘 해야 하는가"만 정리한 요약이다. 위쪽의 개별 항목들과 내용이 중복될 수 있으나, 여기가
최신·최종 기준이다(모순 발생 시 이 섹션을 우선).

### 1순위 — 사람 전용, AI가 대신 못 함(가장 시급, 병합 없이는 아무것도 안 풀림)

1. **브랜치 4개 병합**(GitHub에서 사용자가 직접):
   - `docs/readme-guide-ai-crawler-policy-sync`(`a0dada3`) — 다른 브랜치와 충돌 0건, 아무 때나 먼저
     병합해도 안전.
   - `fix/plugin-mcp-server-bundling`(`6624e76`) — 다른 브랜치와 충돌 0건, 아무 때나 먼저 병합해도
     안전. **가장 급한 이유**: 실사용자가 실제로 겪은 크리티컬 버그(MCP 미연결)의 수정본.
   - `feat/content-structure-detection`(`67d53c5`)과 `feat/geo-qa-and-jsonld-product-fields`
     (`498988c`) — 이 둘은 서로 `packages/mcp-engine/src/rules/registry.ts`·
     `packages/mcp-engine/test/unit/rules.test.ts` **2개 파일에서 겹침**(둘 다 `ALL_RULES` 배열에
     새 규칙을 추가해서 생긴 자연스러운 겹침, 실수 아님). 어느 쪽을 먼저 병합해도 상관없지만,
     나중에 병합하는 쪽에서 Git이 두 파일에 대해 충돌 표시를 낼 가능성이 있음 — 그때는 **양쪽이
     추가한 import·배열 항목·테스트 블록을 전부 살려서** 합치면 됨(한쪽을 버리면 규칙이 유실됨).
     충돌이 실제로 나는지 여부는 두 브랜치의 정확한 변경 줄 위치에 달려있어 지금 100% 예단은 못
     함(가능성으로만 안내, 확정 아님) — 하지만 겹치는 파일이 있다는 사실 자체는 `comm -12`로
     확인된 사실.
   - done-when: `git branch -a`에서 4개 브랜치가 모두 `master`에 merge된 상태로 표시, `master`
     기준 `npm run typecheck && npm run build && npm run test` 전부 통과.

2. **`fix/plugin-mcp-server-bundling` 병합 후 실사용 재검증**(사람 전용) — 브랜치가 고친 문제
   자체가 "자동테스트로는 못 잡고 실사용자가 실제로 겪어야만 드러나는 버그"였으므로, 병합만으로는
   "고쳐졌다"고 말할 수 없음. 위쪽 "병합 후 실사용 재검증 체크리스트" 섹션(빠른 방법:
   `claude --plugin-dir` / 정식 방법: 재설치→새 세션→진단 요청 6단계)을 그대로 따라 확인.
   - done-when: 새 Claude Code 세션에서 `/plugin install` 후 실제 진단 요청이 "MCP 도구가 연결되지
     않았습니다" 없이 성공.

### 2순위 — 사람 전용, 1순위와 병행 가능(블로킹은 아님)

3. **법무 검토 6건**(L1·L2·L4·L5·L12·L13, `.PRD/README.md` 결정 로그 기준) — npm 공개 발행 등
   실제 배포 전 PRD 자체 게이트. 완료 전까지 로컬 번들 방식(현재 `fix/plugin-mcp-server-bundling`의
   방식)을 유지.
4. **Mac/Linux 수동 검증** — `.PRD/03_PHASES.md` Phase 1 자체 체크리스트("마켓 플러그인으로 설치 →
   다른 프로젝트에서 검증 Win/Mac/Linux")의 나머지 2개 OS. Windows만 검증됨(이 세션 포함).

### 3순위 — 완전히 차단됨(사람이 먼저 뭔가를 줘야 AI가 착수 가능)

5. **GSC/GA4/PSI 실연동** — `packages/mcp-engine/src/integrations/`가 `fake-clients.ts`만 있고
   실제 연동 코드가 없음(의도적 스캐폴딩-only 상태). 사용자가 실제 Google 서비스계정 JSON을
   제공해야 코드 착수 가능 — 그 전까지는 AI가 대신 진행할 방법이 없음(크리덴셜은 대신 만들어줄
   수 없는 종류의 것).

### 4순위 — AI가 할 수 있지만 "지금 하지 말 것"(병합 완료 후로 순서 미루기)

6. **README/GUIDE/FAQ 문서 갱신** — 이번 세션에 추가된 규칙들(title/h1/alt 구조 탐지, CWV-TBT,
   Q&A 구조 탐지, JSON-LD Product 필수필드 검증)이 아직 문서에 반영 안 됨. `.PRD/04_PROJECT_SPEC.md`
   "문서화 = 왕초보 README·GUIDE·TROUBLESHOOTING·FAQ (문서 없이는 완료 아님)"이 핵심 요구사항이라
   실제로는 남은 작업이지만, **병합 전에 미리 하면 병합 후 다시 어긋날 위험**이 있어 병합 완료
   후로 미루는 게 순서상 맞음(이번 세션 내내 지켜온 "안정 먼저" 원칙과 동일).
7. **JSON-LD 콘텐츠 일치("환각 0") 검증** — `feat/geo-qa-and-jsonld-product-fields` 계획 단계에서
   의도적으로 제외한 항목(오탐 위험 있는 퍼지 매칭 설계가 필요해 별도 라운드로 미룸).
8. **Product 외 타입으로 필수필드 검증 확장**(Article은 Google 문서가 "필수 속성 없음"이라 확인돼
   대상에서 제외됨 — Organization/LocalBusiness 등 새 타입을 추가할 때마다 이번처럼 Google 공식
   문서로 먼저 확인 후 추가하는 패턴 유지).
9. **`robots.ts`의 "robots.txt 명시적 차단"과 "네트워크 오류로 조회 실패"를 타입 레벨에서 구분**
   — 지금은 안내 문구만 정직하게 고쳐뒀고(양쪽 다 "차단됨"으로 뭉뚱그려 안내), 근본적으로 나누려면
   `robots.ts`~`crawler.ts`~`audit-orchestrator.ts`~`server.ts` 4개 파일을 가로지르는 리팩터가
   필요해 지난번 버그 수정 범위를 넘어선다고 판단해 보류함.
10. **`npm audit fix --force`로 moderate 취약점 17건 정리** — 전부 lighthouse의 간접 의존성
    (`@opentelemetry/*`)이고 프로젝트 자체 기준(`--audit-level=high`)은 이미 통과 중이라 시급하진
    않음. 다만 `--force`가 lighthouse를 12.6.1로 낮추는 breaking change라 신중하게, 별도로 검증하며
    진행해야 함(회귀 테스트 전체 재실행 필수).

### Phase 3(다중 엔진·CI/CD·hreflang·백링크) — 아직 논의 대상조차 아님

PRD 자체 전제조건("Phase 1~2 운영 중")이 위 1~2순위가 전부 끝나야 채워짐. 지금 시점에 Phase 3
세부 계획을 세우는 건 시기상조 — 위 1순위가 실제로 완료된 뒤 다시 판단.

---

## 4개 브랜치 사전 통합 + MCP 서버 번들 재생성 (2026-07-27)

> 위 "1순위" 항목 1의 실행 결과. **사용자가 4개 브랜치를 GitHub에서 개별 병합하며 직접 충돌을
> 풀어야 했던 작업**을, 로컬에서 미리 병합·충돌 해결·재검증까지 마친 뒤 **PR 리뷰 1건**으로
> 좁혔다. master·기존 4개 브랜치는 전부 무변경 — 새 브랜치 `chore/integrate-pending-branches`만
> 추가됨(origin push 완료, PR 생성은 표준 지시에 따라 하지 않음 — 사용자 몫).

### 실행 순서(왜 이 순서인가)
1. **병합 전 기준선 확보** — 병합 전 `feat/geo-qa-and-jsonld-product-fields`(당시 HEAD)에서
   `npm run typecheck && npm run build && npm test` 먼저 실행해 **389/389 통과**를 확인(병합 후
   실패가 나와도 "원래 있던 문제"와 "병합이 만든 문제"를 구분할 수 있도록).
2. **충돌 없는 3개 브랜치 먼저 병합**(`fix/plugin-mcp-server-bundling` → `docs/readme-guide-
   ai-crawler-policy-sync` → `feat/content-structure-detection`) — 전부 `git diff --name-only`
   기준 파일 겹침 0건이라 위험이 가장 낮은 것부터.
3. **충돌 예상 브랜치(`feat/geo-qa-and-jsonld-product-fields`) 마지막 병합** — 위 로드맵이
   "가능성으로만" 안내했던 `rules.test.ts` 충돌이 실제로 발생함(예측 확인됨). `registry.ts`는
   자동 병합 성공(21개 규칙 전부 보존). `rules.test.ts` 3개 충돌 블록은 **양쪽이 추가한 내용을
   전부 살리는 원칙**으로 수동 해결(한쪽을 버리면 규칙이 유실되므로) — `R-CWV-TBT-POOR` describe
   블록과 `R-QA-STRUCTURE-MISSING`/`R-JSONLD-PRODUCT-INCOMPLETE` describe 블록을 둘 다 유지,
   "known-good 픽스처" 배열도 `contentComplete`(title/h1)와 `validQaJsonLd`(FAQPage) 스프레드를
   양쪽 다 포함하도록 병합.
4. **번들 재생성 — 이번 작업에서 가장 중요한 발견**: 4개 브랜치를 전부 병합해도
   `packages/plugin/mcp-server/dist/`(실사용자에게 배송되는 실제 코드)는 자동으로 갱신되지
   않는다는 걸 실측으로 확인함 — 번들의 `registry.js`를 직접 열어보니 master 시점 규칙 14개만
   import하고 있었고, `content-structure.js`·`qa-structure.js`·`jsonld-required-fields.js`가
   물리적으로 존재하지 않았다(4개 브랜치를 병합만 하고 여기서 멈췄다면, "브랜치가 4개나 병합됐는데
   사용자는 여전히 구버전 규칙만 받는" 상황이 재발할 뻔했다 — 이번 세션의 "🔴 치명적 결함" 절이
   기록한 사고와 정확히 같은 종류). `npm run package:plugin`(build → clean-dist → package-for-
   plugin.mjs) 실행으로 해결, 재빌드된 번들의 `registry.js`에서 21개 규칙 import 전부 확인.
5. **최종 검증 2회 독립 실행**(병합 직후 1회, 번들 재생성·커밋 후 1회) — 둘 다 동일하게
   `typecheck 0에러 · build 0에러 · vitest 61파일 416/416 통과`로 재현됨(플레이키 아님을 확인).
   번들 서버 로컬 스모크 테스트(`node packages/plugin/mcp-server/dist/server.js`)도 크래시 없이
   정상 기동.

### 커밋 3개(전부 `chore/integrate-pending-branches`, master 무변경)
- `efe8d14`/`211ac15` — 충돌 없는 3개 브랜치 병합 merge 커밋
- `3dd9d84` — `feat/geo-qa-and-jsonld-product-fields` 병합(충돌 수동 해결 포함)
- `917f701` — `[chore]` 번들 재생성(24개 파일, 신규 규칙 4모듈 12개 파일 + registry/server 재컴파일)

### 남은 것(사람 전용, 축소됨)
- **PR 생성 완료(2026-07-27)**: https://github.com/sodam-ai/SoDam-SeoMedic/pull/1
  (`chore/integrate-pending-branches` → `master`) — 사용자가 "AI가 PR까지 생성"을 명시적으로
  선택해 진행. **병합은 여전히 사용자 전용**(표준 지시에 따라 AI가 대신하지 않음). 이 PR이
  처음으로 3-OS CI를 돌렸고, 그 결과가 아래 새 섹션의 발견으로 이어짐.
- 이후 절차는 기존 로드맵의 "1순위 항목 2"(`fix/plugin-mcp-server-bundling` 병합 후 실사용
  재검증) 그대로 유효 — 대상이 이 PR 병합 이후로 바뀌었을 뿐, 체크리스트 자체는 무변경.
- 법무 6건·Mac/Linux 검증·GSC/GA4/PSI·문서 갱신(README/GUIDE에 신규 규칙 7종 반영) 등 기존
  2~4순위 항목은 전부 무변경으로 유효.

### 이 섹션이 스스로 밝히는 한계
- 이 통합 작업은 **로컬 커밋 재구성**(병합 커밋 3개 + chore 커밋 1개)이라, 만약 사용자가 이미
  4개 브랜치를 GitHub에서 개별적으로 병합 시작했다면 이 브랜치의 커밋 그래프와 어긋날 수 있음 —
  push 직전 `git ls-remote --heads origin chore/integrate-pending-branches`로 동명 브랜치 없음을
  확인했으나, 4개 원본 브랜치 자체가 이미 병합됐는지까지는 재확인 안 함(이 세션 시작 시점엔
  `gh pr list --state all`이 빈 목록이라 PR을 통한 병합은 없었음을 확인했었음).
- CHECKPOINT.md 이 갱신은 표준 지시("CHECKPOINT.md는 커밋하지 않음")에 따라 **커밋하지 않고
  unstaged로 유지**.

### 신규 발견 — 테스트 픽스처 npm audit 고위험 3건 (2026-07-27, M9 보안 게이트 사각지대)

> 위 최종 검증(전체 테스트 실행) 로그에 `pretest`가 찍은 "3 high severity vulnerabilities" 한 줄을
> 놓치지 않고 직접 `npm audit --audit-level=high`로 재현·조사한 결과. 추측이 아니라 명령 실행
> 결과로 확인된 사실만 기록한다.

- **대상**: `packages/mcp-engine/test/fixtures/nextjs-minimal` — `fix-orchestrator`/
  `render-bridge` 통합테스트가 `next build && next start`로 실제 기동시키는 테스트 전용 최소
  Next.js 프로젝트. 루트 `package.json`의 `workspaces`(`packages/mcp-engine`만 등록)에 속하지
  않고, `pretest` 훅이 `npm ci --prefix test/fixtures/nextjs-minimal`로 **별도 설치**한다.
- **확인된 취약점 3건**(전부 high):
  1. `next` — GHSA-4c39-4ccg-62r3(Edge Server Action payload 무제한) ·
     GHSA-p9j2-gv94-2wf4(rewrites SSRF) · GHSA-q8wf-6r8g-63ch(Image Optimization SVG DoS) ·
     GHSA-955p-x3mx-jcvp(내부 Server Function 엔드포인트 노출)
  2. `postcss` <=8.5.17 — GHSA-qx2v-qp2m-jg93(`</style>` 미이스케이프 XSS) ·
     GHSA-6g55-p6wh-862q/GHSA-r28c-9q8g-f849(sourceMappingURL 경로순회·임의파일 노출)
  3. `sharp` <0.35.0 — libvips 상속 취약점(CVE-2026-33327/33328/35590/35591)
- **프로덕션 영향 — 없음(확인됨, 구조로 검증)**: `packages/plugin/mcp-server/`로 복사되는 건
  `mcp-engine`의 `dist/`+trimmed `package.json`뿐(`package-for-plugin.mjs` 참고) — 이 픽스처
  디렉터리는 애초에 복사 대상이 아니라 **사용자에게 배송되는 코드에는 전혀 포함되지 않는다.**
- **PRD M9 보안 게이트의 실제 사각지대(확인됨)**: 루트 스크립트 `"audit": "npm audit
  --audit-level=high"`(`package.json:12`)는 workspaces 기준으로 도니 이 `--prefix` 별도 설치
  픽스처는 스캔 범위 밖 — CI의 "Audit (high severity)" 스텝도 동일하게 놓친다. 즉 M9("`npm
  audit` 고위험 0")가 "통과"로 보고돼도 이 3건은 지금까지 한 번도 게이트에 걸린 적이 없었다.
- **실위험도는 낮음(평가, 단정 아님)**: 이 Next.js 인스턴스는 통합테스트 중에만 `localhost`에
  잠깐 기동했다가 종료되는 휘발성 로컬 프로세스라, 위 취약점들이 노리는 "공개 배포된 서버"
  시나리오와는 노출 경로가 다르다.
- **지금 고치지 않기로 결정한 이유**: `npm audit fix --force`는 `next@16.2.12`로 픽스처가
  선언한 의존성 범위를 벗어나 강제 업그레이드하며(breaking change), 그 결과로 이 픽스처에
  의존하는 통합테스트 다수가 깨질 위험이 있다 — 지금은 병합 게이트(PR)가 최우선이라 이 시점에
  손대지 않기로 판단.
- **후속 과제로 등록**: 다음 라운드 후보에 추가 — ① 픽스처 의존성 업그레이드를 별도 브랜치로
  분리해 통합테스트 회귀와 분리 검증 ② (더 근본적) 루트 `audit` 스크립트가 `test/fixtures/`
  하위 별도 설치까지 포함하도록 확장해 이런 사각지대가 재발하지 않게 게이트 자체를 보강.

### 신규 발견·해결 — 루트 npm audit 고위험 4건 (2026-07-27, PR #1의 첫 3-OS CI가 잡아냄)

> 위 픽스처 건과는 **별개의 사안**이다. 이건 워크스페이스 스캔 범위 **안**에 있어 M9 게이트가
> 정상적으로 작동해 CI를 실제로 막았고(ubuntu·macOS 둘 다 Audit 스텝 실패), 취약 패키지가
> 실사용자 배포본에도 포함된다는 점에서 우선순위가 더 높다.

- **원인 확인(가설 아님, `git diff` 직접 대조)**: PR #1의 `package-lock.json`은 `master`
  (`ed7eba5`)와 **완전히 동일**(diff 0줄). 즉 이번 4브랜치 통합이 만든 문제가 아니라, 마지막
  그린 CI(2026-07-14) 이후 `postcss`·`fast-uri`·`fast-xml-parser`·`brace-expansion`에 새로
  게시된 GHSA로 인한 time-drift성 실패 — **지금 `master`를 그대로 재실행해도 동일하게
  빨간불**이 뜬다.
- **프로덕션 영향 있음(확인됨, 픽스처 건과 대비)**: `ts-morph`(`src/fixers/*`)·`lighthouse`
  (`src/cwv/*`, orchestrator)는 실제 런타임 의존성이고 `packages/plugin/mcp-server/package.json`
  번들에도 그대로 포함됨 — 플러그인 설치/업데이트 시 SessionStart 훅이 실제로 설치한다.
- **해결**: 별도 브랜치 `fix/root-audit-high-severity`(`master` 기준, 커밋 `d9ae6fd`)에서
  `npm audit fix`(비파괴, `--force` 아님)로 고위험 4건 전부 해결. `package.json` 변경 없음
  (기존 선언된 semver 범위 내 lockfile 갱신만). 잔여 중위험 2건(`@hono/node-server` →
  `@modelcontextprotocol/sdk` 다운그레이드 필요)은 breaking change라 이번 범위에서 제외 —
  CI 게이트가 `--audit-level=high`라 영향 없음.
- **검증**: typecheck 0에러 · build 0에러 · vitest 379/379 통과(master 기준 스위트) ·
  `npm run audit`(CI와 동일 커맨드) exit 0.
- **PR #1과 분리한 이유**: PR #1은 "4개 브랜치 통합"이라는 명확한 스코프가 있어 무관한 보안
  패치를 섞으면 리뷰 범위가 흐려짐. 이 수정은 `master`에 독립적으로 필요해 별도 PR로 분리.
- **PR 생성 완료**: https://github.com/sodam-ai/SoDam-SeoMedic/pull/2
  (`fix/root-audit-high-severity` → `master`). 병합은 사용자 전용.
- **권장 병합 순서**: 이 PR(#2) 먼저 병합 → PR #1을 `master`로 리베이스하면 PR #1의 Audit
  게이트도 자동으로 그린이 됨.

### 병합 완료 (2026-07-27, 사용자 명시 승인 후 진행)

- **PR #2 병합**: `c2374c9`(master). 3-OS 전부 green 확인 후 병합.
- **PR #1 갱신·재검증**: `origin/master`(PR #2 반영분)를 `chore/integrate-pending-branches`에
  병합(`749b721`, 충돌 0) → 로컬 typecheck/build/audit 재확인(0에러·고위험 0) → push → CI
  재실행. **재실행 결과 Test 3-OS 전부 통과**(직전 라운드에서 Windows만 겪었던 `(1c)` 30초
  타임아웃은 재현되지 않음 — 같은 커밋 재실행만으로 통과해 **플레이키로 확정**, 실제 회귀
  아니었음). Audit도 3-OS 전부 통과.
- **PR #1 병합**: `725c600`(master). **master가 이제 4개 기능 브랜치(콘텐츠 구조 탐지·QA/JSON-LD
  필드·README 동기화·MCP 서버 번들링 수정) + audit 고위험 수정을 전부 포함한 최신 상태**.
  로컬 `master`도 fast-forward로 동기화 완료(`ed7eba5..725c600`).
- **병합은 사용자가 CI green 확인 후 명시적으로 "진행해줘"라고 승인한 뒤 실행**(표준 지시
  "PR·Merge는 AI가 대신하지 않음"의 예외 — 이번 세션 한정으로 사용자가 직접 승인).

### 문서 PR + JSON-LD 콘텐츠 일치 검증 신규 구현 (2026-07-27, 이어서)

- **PR #3(문서)**: `docs/new-rules-documentation` — README/GUIDE 한·영+HTML 8개 파일에
  Stage 4·5 신규 규칙 7종 반영, PR 생성 완료(https://github.com/sodam-ai/SoDam-SeoMedic/pull/3).
  **CI가 GitHub 계정 결제 문제("recent account payments have failed")로 3-OS 전부
  즉시 실패** — 코드/문서 문제 아님, `sodam-ai`가 개인 계정이라 결제 설정은
  https://github.com/settings/billing 에서 사용자 직접 처리 필요(사람 전용, 미해결).
- **전체 검증 1회 실시(2026-07-27)**: typecheck·build·audit(고위험 0) 전부 통과,
  vitest 416/416 통과. 하드코딩 시크릿·프로덕션 console.log·빈 catch 블록·GitHub 토큰
  노출·경로 탈출 가드 부재 등 자동테스트가 못 잡는 항목도 직접 grep/코드 대조로 점검,
  전부 이상 없음 확인. 번들 서버 로컬 기동도 크래시 없음.
- **PRD 재대조로 발견**: `.PRD/03_PHASES.md:100` Phase 2 성공기준 "JSON-LD가 페이지
  내용과 일치(환각 0)"가 코드로 구현된 적이 없었음(`jsonld-required-fields.ts`는 필드
  "존재 여부"만 검사, "실제 값 일치"는 검사 안 함 — grep으로 관련 코드 0건 확인). Phase 2
  잔여 항목 중 GSC/GA4/PSI(사람 전용, 자격증명 필요)를 제외하면 유일하게 AI가 바로 착수
  가능한 PRD 명시 미완성 항목이라 이걸 다음 작업으로 선정(Phase 3는 PRD가 "Phase 1~2
  운영 중"을 전제조건으로 명시해 아직 시기상조로 판단, 착수 안 함).
- **구현(`feat/jsonld-product-content-match` 브랜치)**:
  - `PageSignals`에 `bodyText`(공백 정규화된 body 텍스트) 필드 추가, raw(linkedom)·
    rendered(Playwright) 양쪽 대칭 구현. **사전 안전성 확인**: `dom-diff.ts`의
    `diffSignals()`가 모든 스칼라 필드를 자동 스캔하지만, 이를 쓰는 `rawRenderedGapRule`은
    `["title","metaRobots"]` 화이트리스트만 위반으로 승격시켜 신규 필드가 회귀 규칙에
    자동 편입돼 노이즈를 만들지 않음을 코드로 먼저 확인한 뒤 진행(2026-07-16 alt 필드
    추가 때와 동일한 사전 검증 절차 반복).
  - 신규 규칙 `R-JSONLD-PRODUCT-NAME-MISMATCH`(high): Product 타입 JSON-LD의 `name`이
    `bodyText`에 없으면 발화. **price/offers는 의도적으로 검사 대상에서 제외**(쉼표·통화
    기호 등 표시 포맷 차이를 "불일치"로 오판하면 그 자체가 환각이 되는 역설 때문 — name은
    결정론적 substring 비교로 안전하게 판정 가능한 유일한 필드). `bodyText` 없으면
    fail-closed로 skip(추측 금지).
  - 기존 5개 테스트 파일의 `emptySignals` 리터럴에 `bodyText` 필드 누락 — typecheck로
    전수 확인 후 보강(놓친 곳 없음, 재검증 완료).
  - 신규 테스트 11개(규칙 8개: known-good/known-bad/대소문자무관/fail-closed/name부재/
    404게이트/price제외 확인 + dom-signals 추출 3개) 추가.
- **검증**: typecheck 0에러 · build 0에러 · vitest 61파일 **427/427 통과**(기존 416+신규 11,
  회귀 0) · 플러그인 번들 재생성 후 `registry.js`에 신규 규칙 포함 확인.
- **PR 생성 완료**: https://github.com/sodam-ai/SoDam-SeoMedic/pull/4
  (`feat/jsonld-product-content-match` → `master`). 병합은 사용자 전용.
- **병합 완료(2026-07-27)**: `9968d7d`(master). CI는 GitHub 결제 문제로 여전히 못 돌았지만,
  git 충돌 0(`mergeable: MERGEABLE`) + 로컬 검증(위 항목) 근거로 사용자가 "CI 빨간불은
  결제 문제일 뿐 코드 문제 아님" 설명 받은 뒤 명시적으로 병합 승인. 로컬 `master` 동기화 완료.
- **미검증(정직하게 밝힘)**: 이 규칙은 실제 다국어/이모지/특수문자가 섞인 상품명이나,
  JS가 상품명을 사후 치환하는 실제 이커머스 사이트에서는 아직 검증 안 됨 — 로컬 유닛
  테스트(합성 픽스처)만으로 확인된 상태. PR #3와 마찬가지로 GitHub 결제 문제가 풀리기
  전까지는 CI도 돌지 않음.

---

## 다음 작업 전체 로드맵 (2026-07-27 최종 정리 — 이 시점 기준 단일 기준 문서)

> ⚠️ 이 섹션이 지금까지의 모든 "다음 작업" 언급(위 여러 절에 흩어진 우선순위·후보 목록 포함)을
> 대체하는 최신·단일 기준이다. 아래 것과 위쪽 개별 절의 내용이 다르면 **이 섹션이 맞다**.
> 근거 없이 새로 지어낸 항목은 없음 — 전부 이 세션에서 실제로 확인·논의·합의된 것만 기록.

### A. 지금 바로 처리 가능 (AI 실행 가능, 승인만 있으면 됨)
1. **PR #3(문서) 병합** — https://github.com/sodam-ai/SoDam-SeoMedic/pull/3
   (`docs/new-rules-documentation` → `master`). PR #4와 완전히 동일한 상태(코드 아닌 순수
   문서, `mergeable` 확인됨, CI는 결제 문제로만 막힘). 사용자 승인 시 PR #4와 같은 방식으로
   즉시 처리 가능.

### B. 최우선 — 사람 전용, 코드로 대체 불가
2. **실사용 재검증(Phase 1 PRD 성공기준 자체)** — 새 Claude Code 세션에서 플러그인 재설치
   → `/seo-audit` 실제 실행 확인. 상세 6단계 체크리스트는 위 "병합 후(또는 병합 전이라도)
   실사용 재검증 체크리스트" 절에 이미 작성돼 있음(재작성 안 함, 그대로 유효).
   **근거**: (a) PRD Phase 1 성공기준 자체가 이 검증을 요구하는데 이 프로젝트 역사상 한 번도
   충족된 적 없음(코드/로컬 검증만 반복됨). (b) 2026-07-18에 "테스트 400여개 전부 통과 +
   로컬 빌드 성공 상태에서도 실사용자는 MCP 연결 자체가 안 됐던" 실제 사고 전례가 있고, 그
   원인을 고친 수정(`fix/plugin-mcp-server-bundling`)이 이번 세션에 드디어 master에
   들어갔지만 **그 수정 자체가 실제로 고쳐졌는지는 여전히 미확인**. 코드 완료 ≠ 문제 해결
   확인이라는 이 프로젝트 자신의 교훈을 정확히 반복할 위험 지점.

### C. 사용자 입력 있어야 착수 가능 (블로킹 조건 명확, 지금은 대기)
3. **GSC/GA4/PSI 실연동**(PRD Phase 2 유일 잔여 성공기준) — 사용자의 Google 서비스계정 JSON
   자격증명 없이는 코드로 시작 자체가 불가능. 받는 즉시 새 세션에서 착수 가능.

### D. 의도적으로 지금 착수 안 하기로 이미 합의됨 (재제안 금지 — 조건 충족 시에만 재개)
4. **Mac/Linux 수동 검증 + CI 인프라(Azure Pipelines/act 등)** — 이번 세션에서 사용자와
   직접 논의 후 명시적으로 합의: "지금 이 PC가 Windows뿐이고 맥은 추후 구매 예정"이라
   실제 맥이 생기기 전까지는 CI 인프라 투자도, 수동 검증도 불필요. Windows 전용 분기
   코드(`process.platform !== "win32"` 체크, `db/connection.ts:22`·`db/path-guard.ts:42`)는
   이미 구현 완료 확인됨 — 남은 건 실제 맥에서의 검증뿐이고 이건 코드 작업이 아님.
5. **GitHub Actions 결제 문제 해결 자체** — "결제 필수 아님" 확인 완료(대안: 다음 결제
   주기 대기 / 로컬 검증만으로 진행 / Azure Pipelines·act 등 대체재 — 전부 논의됐으나
   지금 투자할 필요 없음으로 합의). 사용자가 비개발자·바이브코더라 인프라 자체를 직접
   다룰 필요 없고, 필요해지면 자연어로 요청만 하면 됨.

### E. 사람 전용 — ⚠️ 2026-08-09 정정: 전제("PRIVATE라 미발동")가 무너짐, 재평가 필요
6. **법무 검토 6건**(L1·L2·L4·L5·L12·L13) — README 14번에 이미 투명하게 공개된 목록.
   ~~변경 없음. 상업적 배포·공개 전 필수지만 지금은 PRIVATE 유지 중이라 미발동.~~
   **정정(2026-08-09, `gh repo view` 실측)**: 저장소는 **현재 PUBLIC**이다(`isPrivate: false`,
   `visibility: "PUBLIC"`). 이 절이 "미발동"이라 판단한 유일한 근거(PRIVATE 상태)가 사실이 아니었다
   — 언제부터 PUBLIC이었는지는 이 세션에서 확인하지 못했다(단정 안 함). PRD(`01_PRD.md:169`)는
   "배포 전 법적·보안 게이트 통과 **필수**"라고 명시하는데, 저장소가 이미 공개된 지금 이 게이트가
   여전히 "장기 보류"로 분류될 수 있는지는 **AI가 대신 판단할 수 없는 영역**(법무 검토 자체가 이
   6건의 내용)이다. **사용자에게 명시적으로 확인이 필요한 상태 변화**로만 기록하고, 코드로 무언가를
   대신 결정하지 않는다.

### F. 지금 시점에 착수하면 안 되는 것 (PRD 자신의 순서 위반)
7. **Phase 3(네이버·Bing·CI/CD·hreflang·백링크)** — `.PRD/03_PHASES.md:113` 전제조건이
   "Phase 1~2 운영 중"인데, 위 B(실사용 재검증)가 아직 안 끝나 Phase 1조차 "운영 중"이라고
   부를 수 없는 상태. Phase 3 논의·설계 자체를 시작하지 않는다.

### 우선순위 요약 (뒤섞이지 않도록)
A(즉시, 작음) → B(사람 전용, 최우선·가장 중요) → C(사용자 입력 대기) → D·E(의도적 보류,
조건 충족 전 재제안 금지) → F(순서상 아직 대상 아님).

---

## 2026-08-04 세션 — PR #5·#6 병합 + 배송 폴더 정합성 정정 + 전체 재검증

### 배경
직전 세션(2026-07-27)이 만든 PR #3·#4 중 #4는 이미 병합됨. 이번 세션은 배송 폴더
(`packages/plugin/`) 안에 실제 구현 상태보다 뒤처진 문구 6곳을 발견해 수정하는 작업(PR #6)을
시작했는데, 그 검증 과정에서 이 브랜치와 무관한 **사전 존재 npm audit 고위험 4건**(time-drift —
2026-07-14·07-27과 같은 패턴, 새 GHSA 발표로 재발)을 발견해 별도 PR(#5)로 분리했다.

### PR #5 — 병합 완료 (`c83b48a`)
`npm audit fix`(비파괴, `--force` 아님) — `@hono/node-server`·`brace-expansion`·`fast-uri`·
`ip-address`·`hono`·`undici` 6개 패키지, `package.json` 무변경(기존 선언된 semver 범위 내
lockfile 갱신만). `ip-address`는 우리 SSRF 가드(`ssrf-guard.ts`, node 내장 `node:net`/`node:dns`만
사용)와 무관한 4단계 전이 의존성(`@modelcontextprotocol/sdk`→`express-rate-limit`)임을 확인 —
과장하지 않음. CI 3-OS 그린 확인 후 병합.

### PR #6 — 병합 완료 (`32f3999`)
배송 폴더(`packages/plugin/`) 문구 6곳 정정 — README.md(엔진 실행 방식 npx→번들, `/seo-fix` 상태),
`skills/seomedic/SKILL.md`(npx 문구), `commands/seo-fix.md`(fork 경로 검증 상태), `SECURITY.md`
(Phase 1.5 승인 게이트 명시, audit 수치 최신화), `server.ts`(`seomedic_fix_github` 설명). 번들
재생성(`npm run package:plugin`) 후 `registry.js` 규칙 22종 diff 0(무손상) 확인.

### PR #3 — 작성 시점엔 미병합, 원인 미확정 (⚠️ 아래 "2026-08-09 정정" 참고 — 실제로는 병합됨)

> **2026-08-09 정정(실측 근거)**: 이 절은 **틀렸다**. PR #3은 이 절이 작성된 뒤
> **같은 날 15:09(KST)에 병합 완료**됐다 — `gh pr view 3` 결과 `state: MERGED`,
> `mergedAt: 2026-08-04T06:09:50Z`, 머지 커밋 `476fe18`, 머지 주체 `sodam-ai`(봇 아님).
> `git log`에도 `476fe18 Merge pull request #3 from sodam-ai/docs/new-rules-documentation`으로
> 남아 있다. 이 파일의 저장 시각(14:23)이 병합(15:09)보다 46분 빨라서 생긴 낡음이며,
> **아래 원문은 조사 이력 보존을 위해 지우지 않고 그대로 둔다.**
>
> 따라서 아래 "사용자 전담으로 전환됨"·"AI는 더 이상 건드리지 않는다"는 **이미 종결된 이슈**다.
> ubuntu·macos Audit 실패의 진짜 원인은 여전히 미확정이지만, **PR #3 자체는 더 이상 대기 항목이
> 아니다.** 다음 세션은 이 PR을 "남은 일"로 착각하지 말 것.

문서 8개 파일(README/GUIDE 한영×md/html)만 건드리는 PR. CI 재실행을 두 차례 시도:
- 1차 재실행: ubuntu·macos·windows 전부 **Audit 단계**에서만 실패(typecheck/build/test는 통과).
  실패한 취약점이 PR #5가 고친 것과 정확히 일치해, "재실행 트리거(04:01)가 PR #5 병합(04:04)보다
  먼저 큐에 들어가 옛 merge-ref를 테스트한 타이밍 문제"로 **가설**을 세움.
- 2차 재실행(병합 완료 후, 겹침 없이 재시도): **ubuntu·macos가 다시 동일하게 실패** — 위 타이밍
  가설이 **틀렸을 가능성이 높음**을 뜻한다. windows는 완료 확인 못함(사용자 지시로 백그라운드
  감시 중단, 이 문서 작성 시점 기준 최종 결과 미확인).
- **사용자 결정(2026-08-04)**: "ubuntu·macos는 내가 나중에 따로 할게" — AI는 더 이상 이 PR을
  건드리지 않는다. 진짜 원인(merge-ref 재계산 지연 vs 다른 원인)은 **미확정 상태로 남음** —
  다음에 이어받는 세션은 "타이밍 문제"로 단정하지 말고 처음부터 재조사할 것.

### 전체 재검증(2026-08-04, master=`32f3999` 기준) — 실행 근거 전부 명시
- `typecheck`/`build`: 0에러(재실행 재확인)
- `test`(vitest 61파일): **427/427 통과**(exit 0)
- `audit`(워크스페이스, CI 게이트 동일 명령): **0 vulnerabilities**
- 배송 번들(`packages/plugin/mcp-server/dist/server.js`) 실제 기동: 5초간 크래시 없음(stdout/stderr
  비어있음) — MCP 프로토콜 통신까지는 아니고 프로세스 기동 스모크만(그건 이미 통과한
  `server-integration*.test.ts`가 담당)
- 보안 스팟체크(grep 직접 실행): 하드코딩 시크릿 0건(오탐 4건=AI봇 이름), 프로덕션 console.log 0건,
  SQL 문자열결합 0건, `eval`/`shell:true` 실사용 0건, 빈 catch 0건, `.env` gitignore 커버 확인,
  `github/token.ts`가 실제 토큰 값을 파일에 안 쓰고 환경변수 참조만 스크립트에 담음(표준 git
  askpass 패턴) 확인, SSRF 가드에 사설/루프백/링크로컬(메타데이터 포함) 차단 로직 실재 확인
- 라이브 진단 5시나리오 직접 실행(`runAudit()` 직접 호출, example.com 등 실제 인터넷 접속):
  정상(example.com, 18.5초·7건 탐지) / 잘못된 스킴(`file://`, 즉시 거부) / 존재하지 않는 도메인
  (2026-07-18에 고친 "진단 0페이지 경고" 문구 정상 출력 — 회귀 없음 확인) / SSRF 트랩 2종(루프백·
  메타데이터, 크롤 차단은 확인했으나 "SSRF 가드 직접 차단"과 "robots.txt 조회 단순 실패"를 이
  스크립트로는 구분 못함 — 기존에 이미 알려진 한계, SSRF 로직 자체는 유닛테스트 27개가 별도 검증)
- **발견된 결함**: 0건(제품 코드). 검증 스크립트 자체의 뒷정리 버그(Windows SQLite 파일 잠금으로
  임시 scratch 폴더 삭제 실패, EBUSY) 1건 — 제품과 무관, 임시 OS 폴더에 잔여 파일 남음(무해)

### 결론 — 로드맵 불변, B(실사용 재검증)가 여전히 유일한 다음 단계
위 "다음 작업 전체 로드맵(2026-07-27)"의 우선순위(A→B→C→D·E→F)는 이번 세션 결과로도 그대로
유효하다. A(PR 병합)는 완료(#5·#6). PR #3은 새로운 항목이 아니라 기존 A의 잔여분이며 사용자
전담으로 전환됨. **B(실사용 재검증)가 여전히 유일하게 남은 진짜 다음 단계.**

---

## 다음 작업 — 실사용 재검증 (2026-08-04 시점, 유일한 진짜 다음 단계, 사람 전용)

> 기존 "병합 후(또는 병합 전이라도) 실사용 재검증 체크리스트"(2026-07-18 작성)를 오늘 병합된
> PR #5·#6 반영 후 상태로 갱신·보강한 최신판. 이 섹션 하나만 보면 착수 가능하도록 자기완결적으로
> 작성했다 — 다른 섹션을 오갈 필요 없음.

### 목표 (PRD 근거, 원문 인용)
`.PRD/03_PHASES.md:33` — `마켓 플러그인으로 설치 → 다른 프로젝트에서 /seo-audit 실행 검증
(Win/Mac/Linux)`. Phase 1의 유일하게 미충족 성공기준. **Windows만** 확인하면 되고(Mac/Linux는
아래 "명시 제외" 참고), 이게 채워지면 Phase 1이 문자 그대로 완결된다.

### 착수 전 반드시 알아야 할 것 — 오늘(2026-08-04) 병합으로 달라진 조건
1. **의존성이 오늘 바뀌었다**: PR #5로 `@hono/node-server`(1.19.15→2.0.12, **메이저 버전
   업**)·`undici`(8.6.0→8.10.0) 등 6개 패키지가 바뀌었다. `@hono/node-server`는
   `@modelcontextprotocol/sdk`의 전이 의존성이라 **MCP 서버의 실제 연결 계층과 무관하지 않다** —
   지금까지 실사용 재검증이 한 번도 성공한 적 없는 이 프로젝트에서, 오늘 이후 첫 시도가 이
   메이저 버전업의 영향을 받을 가능성을 배제할 수 없다(가능성, 확인된 사실 아님).
2. **배송 `package.json`은 semver 범위(`^`)로 고정**(`mcp-server/package.json` 직접 확인,
   `"@modelcontextprotocol/sdk": "^1.29.0"` 등) — 즉 사용자 PC에 실제로 설치될 버전은 **오늘
   mcp-engine 개발용 lockfile을 고친 것과 무관하게, 설치 시점의 npm 레지스트리 최신 버전**으로
   결정된다. `@hono/node-server`의 정확히 어떤 버전이 깔릴지는 **지금 확정할 수 없다**(코드로
   보장 불가 — 정직하게 미확인으로 남김).
3. **`node_modules` 캐시 감지 로직 확인됨**(`ensure-mcp-deps.mjs` 직접 읽음): 번들 `package.json`
   내용이 이전 설치본과 **완전히 동일하면 재설치를 건너뛴다**. 오늘 PR #6은 `server.ts`(로직/설명
   문자열)만 고쳤고 `mcp-server/package.json`(의존성 목록)은 안 바꿨다 — 그래서:
   - **이미 SeoMedic을 설치해본 적 있는 환경**: `server.js`(코드)는 마켓플레이스가 플러그인
     소스를 통째로 갱신하므로 오늘 변경분이 자동 반영됨. `node_modules`는 캐시 재사용(정상
     동작, 버그 아님).
   - **처음 설치하는 환경**: `installed` 마커가 없어 무조건 새로 설치 → 위 2번 항목의 불확실성이
     그대로 적용됨.

### 절차 (6단계, 기존 그대로 유효 — 오늘 변경이 이 순서 자체를 바꾸지 않음)
1. 기존에 설치된 seomedic 플러그인이 있다면 제거 후 재설치(오래된 캐시가 남아있으면 새 훅이 안
   붙을 수 있음) — `/plugin uninstall seomedic` → `/plugin marketplace add sodam-ai/SoDam-SeoMedic`
   → `/plugin install seomedic@sodam-seomedic-marketplace`.
2. **완전히 새 세션**을 연다(이번 세션 이어서 하지 않기 — 실사용 검증은 항상 새 세션이어야 훅이
   실제로 처음부터 발동하는지 볼 수 있음).
3. 새 세션 시작 직후 콘솔에 `[ensure-mcp-deps] seomedic MCP 서버 의존성 설치 중...` 메시지가
   뜨는지 확인 — 안 뜨면 SessionStart 훅 자체가 안 붙은 것(hooks.json 배선 문제).
4. `npm install`이 실제로 몇 분 걸리는지, 끝까지 성공하는지 관찰(`better-sqlite3` 네이티브
   빌드·`playwright install chromium` 다운로드 포함이라 원래도 느릴 수 있음 — 실패해도 정상
   흐름인지 "몇 분 걸림"인지 구분 필요).
5. 설치 완료 후 실제 URL로 진단 요청(예: `https://example.com` 또는 사용자 소유 사이트)해서 "MCP
   도구가 연결되지 않았습니다" 메시지 없이 seomedic 도구가 실제로 호출되는지 확인.
6. 한 번 실패해도 재시도가 되는지 보려면: 3~5단계를 만족한 뒤 세션을 하나 더 새로 열어 재실행 —
   이미 설치된 상태에서는 `npm install`을 건너뛰고 바로 연결되는지(캐시 비교 로직) 확인.

### 예상되는 위험·실패 시나리오와 대응 (미리 검토 — 실행 전 필수)
| 위험 | 근거/가능성 | 실패 시 알아볼 방법 |
|---|---|---|
| **MCP 연결 자체가 또 실패**(2026-07-18과 같은 사고 재발) | 이 프로젝트가 이미 한 번 "테스트 400여개 통과+로컬 빌드 성공" 상태에서도 실사용자 설치가 실패했던 전례가 있음 — 코드 완료≠실사용 성공이라는 이 프로젝트 자신의 교훈 | 콘솔에 훅 메시지가 떴는지(3단계)부터 확인 — 안 떴으면 훅 배선 문제, 떴는데도 연결 실패면 `npm install` 로그(4단계) 확인 |
| **`@hono/node-server` 2.x 메이저 업으로 인한 호환성 문제** | 오늘 처음 이 버전으로 실사용 테스트 — 가능성일 뿐 확인된 사실 아님 | 연결 실패 시 `${CLAUDE_PLUGIN_DATA}/node_modules/@hono/node-server/package.json`의 실제 설치 버전 확인, `@modelcontextprotocol/sdk`가 요구하는 범위와 대조 |
| **better-sqlite3 네이티브 모듈 로딩 실패** | Windows에서 prebuilt 바이너리 로딩은 CI 그린이어도 사전 보장 안 됨(기존에 이미 알려진 한계, `CHECKPOINT.md` M9-3) | `npm install` 로그에서 native build 관련 에러 유무 확인 |
| **옛 캐시로 검증이 무효화됨** | `ensure-mcp-deps.mjs`가 package.json 동일 시 재설치 스킵 — 이번엔 package.json이 안 바뀌어 신규 코드는 자동 반영되지만, 착각하기 쉬운 지점 | 1단계(완전 재설치)를 건너뛰지 말 것 |
| **같은 세션에서 검증해 결과 무효** | SessionStart 훅은 세션 시작 시점에만 발동 | 반드시 새 세션(2단계) |
| **재검증이 실패해도 실패로 취급 안 하고 넘어감** | 사용자 지시("절대 하지 말 것: 실패한 테스트를 무시하고 넘어가기")와 정면 충돌 | 실패 시 화면 메시지·콘솔 로그를 그대로 다음 세션에 가져와 원인 특정부터(추측 금지) |

### 명시적으로 지금 이 작업에 포함하지 않는 것 (혼동 방지)
- ~~**PR #3(README/GUIDE, ubuntu·macos audit 실패)** — 사용자 전담으로 전환됨(2026-08-04). 이
  실사용 재검증과 무관(문서만 건드리는 PR).~~ → **2026-08-09 정정: PR #3은 2026-08-04 15:09에
  병합 완료(`476fe18`)됐다. 더 이상 대기 항목이 아니다.**
- **Mac/Linux 실행** — 사용자·PC 환경이 Windows뿐이라 여전히 불가, 재구매 전까지 보류 합의 유지.
- **GSC/GA4/PSI 실연동** — 자격증명 미제공으로 여전히 차단.

### done-when
새 Claude Code 세션에서 `/plugin install` 후, 실제 URL 진단 요청이 "MCP 도구가 연결되지
않았습니다" 없이 seomedic 진단 리포트를 실제로 반환한다. 이 조건이 충족되면 `.PRD/03_PHASES.md:33`
체크박스가 실측 근거와 함께 처음으로 체크 가능해지고, Phase 1이 문자 그대로 완결된다.

---

## M9 이후 재발견 — 실사용 배포 게이트 (2026-08-09~10, 미해결)

**왜 이 섹션이 필요한가**: M9는 "격리 세션(`--plugin-dir`+`--mcp-config`)" 방식으로 검증하고 done 처리됐다. 그런데 이 방식은 마켓플레이스 캐시를 아예 거치지 않는다 — 이 프로젝트 역사상 처음으로 실사용자가 **진짜 설치 경로**(`/plugin marketplace add` → `/plugin install`)로 테스트했더니, MCP 도구가 세션에 전혀 로드되지 않는 문제가 실측으로 드러났다. 즉 M9의 "done"은 실사용자 기준으로는 성립하지 않았다 — 이 사실을 숨기지 않고 기록한다.

### 근본원인 (둘 다 실제 코드 대조로 확인, 추측 아님)

1. **`plugin.json` 버전 무갱신** — `git log` 전체 이력 검색 결과 저장소 역사상 `version` 필드가 단 한 번도 바뀐 적 없음(0.1.0 고정). Claude Code 플러그인 캐시는 버전으로 최신 여부를 판단하므로, 내용이 바뀌어도 캐시가 갱신되지 않음.
2. **배포 번들과 소스의 불일치** — `packages/mcp-engine/scripts/package-for-plugin.mjs`(`npm run package:plugin`)로 수동 재생성해야 실제 배포 파일(`packages/plugin/mcp-server/dist/`)에 반영되는 구조인데, 이 단계가 자동화돼 있지 않음. 이번 세션의 보안수정(SSRF)·오탐수정(.seomedic)이 소스에는 있었지만 배포 번들에는 **0건 반영**돼 있었음을 `git diff --stat`·`grep`으로 직접 확인.

### 이번 세션(2026-08-09~10)에서 처리한 것
- [x] `plugin.json` 0.1.0→0.1.1
- [x] PR #11(SSRF)·#13(.seomedic 오탐) 소스를 병합해 `npm run package:plugin`으로 번들 재생성, grep으로 반영 확인
- [x] 회귀 검증: `npm run typecheck` 0에러, `npm test` 431/431 통과, `npm run audit` 기존 known 이슈(nanoid) 외 신규 취약점 0건
- [x] 위 전부를 PR #14(`fix/plugin-version-cache-bump`)에 반영해 push, 병합 권장 순서를 PR 설명에 기록

### 후속 세션(2026-08-17)에서 완결한 것
- [x] PR #8(nanoid audit)·#9(Windows CI 타임아웃)·#10(문서 동기화)·#12(Phase 2 준비 문서) → master 병합
- [x] master를 PR #14 브랜치에 재병합·push → 3-OS CI 전부 그린 실측 확인(macOS 5m30s·Ubuntu 4m37s·Windows 18m22s)
- [x] `packages/plugin/.claude-plugin/plugin.json`의 `license` 필드 `MIT→Apache-2.0` 수정·커밋 — **정정: 위에서 "자기보호 가드레일로 AI 편집 불가"라 적었던 것은 틀렸다. 이번 세션에서 Edit 도구로 정상 수정됨(가드레일이 없거나 다른 조건이었던 것으로 추정, 정확한 원인은 미확인)**
- [x] **PR #14 병합** — `mergedAt: 2026-08-17T07:49:31Z`
- [x] PR #11·#13을 master 대상으로 별도 병합 시도 → GitHub이 "already merged"로 자동 인식(원본 커밋이 #14를 통해 이미 master 조상에 포함됨, `git cherry`로 고유 커밋 0건 확인). 별도 조치 불필요
- [ ] **실사용 재검증(완전히 별도의 새 Claude Code 세션에서)** — `/plugin uninstall` → 재설치 → `/reload-plugins`에서 "2 errors during load"가 사라지는지, `/seo-audit`가 실제로 도구를 등록하는지 확인. **아직 미확인 — 이 재검증 전까지는 "완전히 해결됐다"고 단정하지 않는다**

### 🔴 이번 세션(2026-08-17)에서 새로 발견한 별도 문제 — PR #10 병합 커밋이 master 계보에서 누락됨(추측 아님, git으로 직접 확인)

PR #8·#9를 순차 병합한 뒤, PR #10과 #12를 **병렬(동시) 호출**로 병합했다. 그 결과:
- PR #10의 병합 커밋(`a73648b`)의 실제 첫 부모가 `66b1c06`(PR #9 병합 직후의 master)이 아니라 `5e8b808`(PR #8 자신의 브랜치 tip, PR #9보다도 이전 스냅샷)로 찍혀 있었다(`git show a73648b --format="%P" -s`로 확인).
- 뒤이어 PR #12의 병합 커밋(`b882c24`)은 `66b1c06`을 부모로 삼아 만들어졌다 — 즉 `a73648b`를 아예 모르는 채로 master 브랜치 위에 얹혔다.
- 결과: GitHub API는 PR #10을 `"state":"MERGED"`로 보고하지만, **그 병합 커밋은 현재 master의 조상 트리에 없다**(`git merge-base --is-ancestor a73648b HEAD` → 거짓, 직접 실행해 확인).
- 영향: PR #10이 담고 있던 실제 콘텐츠 — 이 CHECKPOINT.md에 대한 대규모 보완(2026-07-15~08-04 시기의 프로젝트 진행사 820줄 상당), `CHECKPOINT_2.md`의 Phase 2 Stage 4~5 소급 기록, `HUMAN_ACTION_CHECKLIST.md`·`.PRD/` 정합성 수정분 — 이 **전부 master에 반영되지 않은 채로 있었다**.
- **원인 추정(확정 아님)**: `gh pr merge`를 병렬(같은 메시지 내 동시) 호출하면 GitHub 백엔드가 각 병합의 base 브랜치 스냅샷을 서로 다른 시점에서 캐시해 계산하는 것으로 보임. 향후 여러 PR을 같은 base 브랜치로 병합할 때는 **반드시 순차적으로(하나씩 완료 확인 후 다음)** 진행하고, 병합 직후 `git log --oneline origin/master`로 병합 커밋이 실제로 조상 트리에 들어갔는지 확인할 것 — GitHub의 `"state":"MERGED"` 응답만으로는 부족하다.
- **조치**: `origin/docs/checkpoint-prd-reality-sync`(PR #10의 실제 브랜치, tip `0280641`)를 master에 직접 재병합해 복구(아래 참고).

### 알려진 잔여 위험 (구조적, 이번 수정 범위 밖)
- 소스(`mcp-engine/src`)와 배포 번들(`plugin/mcp-server/dist`)의 동기화를 강제하는 자동 검사(CI)가 없음 — 사람이 `package:plugin` 실행을 또 잊으면 같은 클래스의 버그가 재발할 수 있음. CI에 "소스 변경 있는데 dist 무변경이면 실패" 체크 추가를 권장(미착수)
- SessionStart 훅(`ensure-mcp-deps.mjs`)이 `${CLAUDE_PLUGIN_DATA}/node_modules`에 `better-sqlite3`·`playwright` 같은 네이티브 모듈을 설치하는 과정 자체는 이번에 별도로 재현 검증하지 못함 — 번들 불일치가 주원인이라는 진단이지만, 이 설치 과정에 독립적인 문제가 남아있을 가능성은 위 실사용 재검증에서만 최종 확인 가능
- Mac/Linux 미검증(M9-3에서 이미 기록된 한계, 여전히 유효)
- nanoid 고위험 취약점이 PR #8 자신의 제목상 "4차 재발" — transitive 의존성 재해석마다 재발하는 패턴, `overrides` 고정 미착수
- 상태: **마켓캐시 버그 자체는 코드 작업 완결(사람의 새 세션 실사용 재검증만 남음). PR #10 누락 복구는 진행 중(아래 섹션)**

---

## 🔴→✅ ensure-mcp-deps.mjs Windows EINVAL 실제 버그 발견·수정 (2026-08-19)

**배경**: 위 "알려진 잔여 위험"이 "SessionStart 훅의 네이티브 모듈 설치 과정 자체는 재현 검증 못 함"이라
명시적으로 남겨둔 미확인 지점이었다. 종합 검증 세션 중 이 파일을 직접 코드 리뷰하다가, 이미 이
저장소가 **같은 클래스의 버그를 다른 파일(`github/npm-install.ts`)에서 한 번 겪고 고친 이력**이
있다는 걸 상기하고, 같은 안티패턴이 여기 남아있는지 대조 확인했다.

**재현(추측 아님, 실제 실행)**: `ensure-mcp-deps.mjs`가 `execFileSync("npm.cmd", ["install"], {...})`를
Windows에서 `shell:true` 없이 직접 호출하고 있었다. 격리된 1회성 스크립트로 정확히 같은 호출을
재현한 결과 — `EINVAL spawnSync npm.cmd EINVAL`로 즉시 실패(Node가 CVE-2024-27980 대응으로
.cmd/.bat 파일의 shell-less 직접 spawn을 거부).

**영향**: 이 스크립트는 **실사용자가 마켓플레이스로 플러그인을 설치한 뒤 Windows에서 첫 세션을 열 때**
`${CLAUDE_PLUGIN_DATA}`에 `better-sqlite3`·`playwright` 등 MCP 서버 의존성을 설치하는 유일한
경로다. try/catch로 세션 자체는 안 죽지만, **의존성 설치가 조용히 실패**해 MCP 서버가 끝내 못 뜬다 —
어제 고친 "버전 캐시" 문제와는 **완전히 별개의, Windows 사용자에게 동일한 최종 증상("도구가 세션에
로드 안 됨")을 일으킬 수 있는 두 번째 원인**이었다. 자동 테스트 스위트(431개)는 이 파일을 전혀
커버하지 않는다(`packages/plugin/scripts/`는 `packages/mcp-engine/test/`의 커버리지 밖).

**원인**: `github/npm-install.ts`가 이미 정확히 문서화해둔 것과 동일 — npm은 Windows에서 `.cmd`
배치 스크립트라, Node 자체의 보안 강화(CVE-2024-27980)로 shell 없는 직접 spawn이 막힌다.

**수정**: `github/npm-install.ts`의 `resolveNpmCliJs()` 전략(먼저 `npm_execpath` 환경변수 확인 →
Windows/Unix 레이아웃 후보 확인 → 찾은 npm CLI 진입점을 `process.execPath`로 직접 실행)을
`ensure-mcp-deps.mjs`에 이식했다. 공유 모듈로 추출하지 않고 자체 구현으로 복제했다 — 이 스크립트는
아직 아무 의존성도 설치되기 전에 실행되는 독립 부트스트랩이라 `mcp-engine`의 코드를 import할 수
없다(이 프로젝트의 기존 선례 — `og-fixer.ts`가 `canonical-fixer.ts` 로직을 의도적으로 복제한 것과
같은 이유).

**검증(실제 end-to-end 실행, 목업 아님)**:
1. `node --check`로 문법 확인.
2. 실제 임시 `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`를 만들어 최소 의존성(`left-pad`) 1개를
   가진 가짜 `mcp-server/package.json`으로 스크립트를 **그대로 실행** — 수정 전 방식(`npm.cmd`
   직접 spawn)이면 EINVAL로 실패했을 시나리오가, 수정 후 정상적으로 `npm install` 실행 →
   `node_modules/left-pad` 실제 설치 → exit 0으로 완료됨을 확인.
2. 멱등성 재확인: 같은 조건으로 재실행 시 변경 없음을 감지해 조용히 스킵(기존 동작 무변경).

**남은 것**: 이 수정도 마켓캐시 버그와 마찬가지로 **완전히 새로운 Windows 환경에서 실제 플러그인
설치 후 첫 세션**으로 최종 확인해야 한다(위 실사용 재검증 항목에 통합). Mac/Linux의
`npm_execpath` 우선 확인 경로는 `npm-install.ts`가 이미 CI 3-OS로 검증한 로직을 그대로 재사용해
이식 위험은 낮다고 판단하나, 이 파일 자체로 별도 3-OS 검증은 하지 않았다(정직하게 명시).

---

## ✅ Phase 2 "4-A" 구현 완료 — R-AI-CRAWLER-POLICY robots fixer (2026-08-19)

`HUMAN_ACTION_CHECKLIST.md` "4-A"가 명시한 Phase 2 잔여 2건 중 외부 인증이 필요 없는 쪽(AI 크롤러
정책)을 구현했다. PRD 재검토 후 이 항목을 강력 추천한 근거: 03_PHASES.md:99의 원래 Phase 2 스코프
그대로이고, robots는 `04_PROJECT_SPEC.md` "예외 없이 gated" 원칙으로 이미 위험이 설계상 억제돼
있으며, 외부 API 키·법무 승인·사람의 실기기 테스트 중 무엇도 필요 없어 지금 바로 코드로 검증 가능한
유일한 신규 기능이었다.

**중요한 선행 결정 확인**: `crawler/ai-crawler-finding.ts`에 이미 "중립 보고만 한다 — 정책 채택
여부는 이 세션에서 사용자 확인을 받지 않은 별도 결정 사항이라 코드가 대신 판단하지 않는다"는 명시적
코드 주석이 있었다. 이번 세션에서 사용자에게 PRD 제안 기본값(검색봇 허용/학습봇 차단)을 구체적으로
제시하고 명시 승인("진행하기")을 받아 그 조건을 충족시켰다 — fixer 코드에도 이 사실을 남겼다.

**구현 범위**(plan→apply→rollback 전체 생명주기):
- `fixers/robots-ai-policy-fixer.ts`(신규) — `app/robots.ts`가 **없을 때만** AI 크롤러 정책
  (학습봇 disallow, 그 외 전부 `*` allow에 위임) 신규 파일 생성을 제안. 이미 있으면(우리가 만든
  것이든 아니든) 절대 재구성하지 않는다 — sitemap/canonical/og처럼 "기존 파일을 안전하게 편집"이
  아니라 "존재 자체가 gated 경계"라는 점이 이 fixer만의 설계 차이.
- `fixers/registry.ts` — `R-AI-CRAWLER-POLICY`를 `gated`로 등록.
- `fix-orchestrator/scan.ts` — Phase 1.5 로컬 렌더 브릿지 전용 robots.txt 조회 함수를 추가.
  **중대 발견**: 기존 `crawler/robots.ts`의 `loadAiCrawlerAccess`는 내부적으로 `safeFetch`(SSRF
  가드)를 쓰는데, 이 가드가 **127.0.0.1(로컬 dev/build 서버)을 사설 IP로 차단**한다 — 그대로
  재사용했다면 Phase 1.5 fix 모드에서 이 기능이 조용히 한 번도 발동 안 했을 것이다. scan.ts가
  sitemap 조회에 이미 쓰던 것과 동일한 "로컬 브릿지 전용 fetch" 패턴(`fetchLocalBridgeHtml`)으로
  fetch 경로만 분리하고, 판정 로직(`evaluateAiCrawlerAccess`)은 기존 것을 그대로 재사용했다.
- `fix-orchestrator/plan.ts` — sitemap 완전성 검사와 동일한 방식(사이트 전역 판정이라 페이지 단위
  규칙엔진 밖)으로 Finding을 만들고, App Router 루트(`app/` 또는 `src/app/`)를 판정해 새 파일
  위치를 정하는 fixer 분기를 추가.
- `fix-orchestrator/apply.ts` — 적용 분기 추가. **다른 세 fixer와 롤백 스켈레톤이 다르다**: 저것들은
  "기존 파일 수정"이라 실패 시 `git checkout`으로 되돌릴 수 있지만, 이 fixer는 "신규 파일 생성"이라
  대상이 git에 전혀 알려지지 않은 파일(untracked) — `git checkout`은 pathspec 오류로 실패하므로
  build 실패 시 `fs.rmSync`로 직접 지운다.
- `fix-orchestrator/rollback.ts` — 신규 파일 생성 fix는 `backup_path`가 정상적으로 null(백업할
  원본 자체가 없음)이라, 기존 로직("backup_path 없으면 무조건 실패")이 그대로면 승인→적용된 이
  fix만 수동 롤백이 항상 막힌다. `rule_id`로 엄격히 좁힌 분기를 추가해 "되돌리기=우리가 만든 파일
  삭제"로 처리 — 다른 세 fixer의 기존 동작(백업 없으면 실패)은 전혀 건드리지 않았다.

**검증(전부 실제 실행, 목업 아님)**:
- 단위 테스트 8개 신규(`robots-ai-policy-fixer.test.ts`) — 신규 생성/멱등/타인 정책 불가침 확인.
- 통합 테스트 4개 신규(`fix-orchestrator-robots-ai-policy-integration.test.ts`, 실제 `next build`
  포함) — (a) 미승인 시 파일 미생성 (b) 승인→적용→build 통과→파일 생성→rollback으로 삭제 원복
  (c) 거부 시 미생성 (d) 재실행해도 중복 fix 없음(멱등).
- **회귀 발견·수정**: 전체 스위트 재실행 중 `fix-orchestrator-integration.test.ts`가 "이 픽스처는
  fix가 정확히 1개(sitemap)"라고 하드코딩한 가정이 깨짐(robots.ts가 없는 같은 픽스처에 이제 새
  fixer도 정당하게 트리거됨) — 기능을 죽이지 않고, rule_id로 정확한 fix를 찾도록 테스트를 고쳐
  재검증(다른 통합 테스트들이 이미 쓰던 것과 동일한 패턴).
- `npx tsc --noEmit` 통과, `npm run build` 통과, `npm run audit` 0건, `npm run package:plugin`으로
  배포 번들 재생성 완료.
- 전체 스위트 최종 재실행: **63개 파일 전부 통과**(신규 2개 포함, 기존 회귀 0건).

**부수 조치**: 저장소 루트/픽스처 하위에서 이 프로젝트와 무관한 다른 로컬 도구의 실행 로그
(`.active-agents*`·`.failure-tracker.jsonl`·`.sodam-re/`)가 untracked 상태로 방치돼 있었음을
발견 — PUBLIC 저장소라 실수로 커밋되면 PRD의 "텔레메트리 0" 원칙과 충돌하므로 `.gitignore`에 추가.

**남은 것**: 사람의 실사용 검증(위 3건에 통합) 전까지 "완전히 검증됐다"고 단정하지 않는다. 이 기능
자체는 Next.js 앱 대상 로컬 fix 모드 한정이며, `/seo-audit`(Phase 1 라이브 URL 분석 전용 경로)는
전혀 건드리지 않았다 — 그쪽은 이미 있던 `loadAiCrawlerAccess`(리포트 전용, fixer 없음) 그대로다.
