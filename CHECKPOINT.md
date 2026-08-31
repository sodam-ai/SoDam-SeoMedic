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

---

## ✅ Phase 2 "4-B" PSI(PageSpeed Insights) field 데이터 실연동 완료(2026-08-19)

`HUMAN_ACTION_CHECKLIST.md` "4-B"가 명시한 Phase 2 마지막 잔여 항목 중, 속성 소유권이 필요 없는
PSI부터 착수했다(문서 자신의 권고 그대로). 이걸로 **PRD가 정의한 Phase 2 기능 스코프(4-A+4-B)는
코드 기준으로 전부 구현 완료**됐다 — 남은 건 전부 사람만 할 수 있는 검증뿐이다.

**실연동 전 설계를 다시 판단한 근거(중요 — 최초 제안과 실제 구현이 달라진 지점)**: 처음엔 `Integration`
DB 엔티티의 `auth_method` CHECK 제약(`'service_account'`만 허용)을 넓히는 마이그레이션이 필요하다고
판단했으나, 실제로 코드를 짜면서 재검토한 결과 **그 판단 자체가 틀렸다는 걸 발견**했다: PSI는 프로젝트별
소유권·서비스계정이 필요 없는 공개 API라(`HUMAN_ACTION_CHECKLIST.md` 4-B 표 — "속성 소유권 불필요")애초에
`Integration` 엔티티(프로젝트 종속·`property_scope`로 소유권 강제)에 안 맞는다. `github/token.ts`의
"env-only 바로 읽기" 패턴을 그대로 따르는 게 정확한 설계였다 — DB 스키마는 전혀 건드리지 않았다.
(GSC/GA4는 실제 서비스계정+속성 소유권이 필요해 `Integration` 엔티티가 여전히 맞는 설계로 남는다 —
이번 세션에서 손대지 않음, 사람의 인증 준비가 먼저 필요.)

**API 계약 검증(실제 키 없이 최대한 확보 가능한 근거)**: Google 공식 문서(`developers.google.com`
`v5/about`·`release_notes`)를 직접 fetch해 `loadingExperience` 필드가 폐기되지 않았음을 재확인했다
— 도중에 "2025-10-18부로 PageSpeed에서 web vitals 제거"라는 검색 결과가 나와 즉시 작업을 멈추고
원본을 대조했으나, Google 공식 페이지(현재 라이브) 어디에도 그런 폐기 공지가 없어 오검색/다른 제품
("CrUX Dashboard", 별개 Looker Studio 템플릿)과의 혼동으로 결론짓고 재개했다 — 사실 확인 없이
밀어붙이지도, 근거 없는 공포에 계획을 버리지도 않은 사례로 기록. `CUMULATIVE_LAYOUT_SHIFT_SCORE`의
`percentile`이 CLS×100 정수임은 공식 문서 예시(percentile 20 + category "AVERAGE" = 실제 CLS
0.20과 등급이 일치)로 교차 확인했으나 **실제 키로 최종 재검증은 못 했다** — 아래 "남은 것" 참고.

**구현 범위**:
- `integrations/psi-token.ts`(신규) — `PAGESPEED_API_KEY` env-only 로딩. `github/token.ts`와
  달리 선택 기능이라 없으면 예외 대신 null.
- `integrations/psi-client.ts`(신규) — Google PSI v5 실제 HTTP 클라이언트. `crawler/fetch-client.ts`의
  기존 `safeFetch` 재사용(SSRF·타임아웃·크기제한 이미 검증된 코드 그대로). API 키가 에러 메시지에
  노출되지 않도록 마스킹(M4). fetcher는 `crawler/sitemap.ts`의 `SitemapFetcher`와 동일한 DI
  패턴으로 주입 가능 — 실제 Google 서버 호출(수십 초, 비결정적)은 CI에 부적합하다는 이 저장소의
  기존 판단과 일관되게, 테스트는 canned 응답만 쓰고 실제 네트워크를 타지 않는다.
- `orchestrator/audit-orchestrator.ts` — CWV(Lighthouse)와 동일한 샘플링 정책(진입 페이지에서만)으로
  연결. `PAGESPEED_API_KEY` 미설정(대다수 사용자) 또는 호출 실패 시 조용히 건너뛰고 나머지 audit은
  100% 기존과 동일하게 진행(선택 기능이 필수 흐름을 막지 않음).
- `report/types.ts`·`report/markdown.ts`·`report/json.ts` — field 데이터 섹션을 lab(CWV)과 나란히,
  각각 다른 라벨("field 데이터입니다 — lab 값과 다를 수 있습니다")로 명확히 구분해 노출(01_PRD
  성공기준 "field 데이터가 리포트에 결합됨" + "lab≠field 명시" 둘 다 충족).
- `integrations/field-data-merger.ts`의 `FieldDataSection` 타입을 `report/types.ts`로 이동(report↔
  integrations 순환 타입 참조 방지) — 로직은 전혀 안 바꿨고 타입 위치만 옮김, 기존 5개 테스트 전부
  그대로 통과 확인.

**검증(전부 실제 실행, 목업 아님 — 단 실제 Google API 키 호출은 못 함, 아래 명시)**:
- 신규 단위 테스트 15개(`psi-token.test.ts` 3개, `psi-client.test.ts` 9개, 나머지는 기존 파일에
  자연히 포함) — CLS 스케일링·부분 metrics·CrUX 데이터 없음(null, 에러 아님)·비200 응답·네트워크
  예외·JSON 파싱 실패·API 키 마스킹·URL 인코딩 전부 canned 응답으로 검증.
- `npx tsc --noEmit`·`npm run build`·`npm run audit`(0건) 전부 통과.
- 전체 스위트 재실행: **65개 파일 전부 통과**(기존 443 + 신규 12), 회귀 0건.
- `npm run package:plugin`으로 배포 번들 재생성 완료.

**남은 것(정직하게 명시)**:
1. **실제 `PAGESPEED_API_KEY`로 진짜 Google 서버 호출을 아직 한 번도 안 해봤다** — 이건 계정·키가
   있어야만 가능해 사람 전용이다(`HUMAN_ACTION_CHECKLIST.md` 4-B "PSI부터 부분 착수 가능"의 나머지 반쪽).
   특히 `CUMULATIVE_LAYOUT_SHIFT_SCORE` ÷100 스케일링은 문서 근거로만 확인했고 실제 응답으로 재검증
   전이다 — 만약 틀렸다면 CLS 수치만 영향받고(다른 필드·audit 나머지는 무관) 고치기 쉬운 국소 버그다.
2. GA4/GSC는 이번 스코프에서 완전히 제외 — 사람의 서비스계정 발급·속성 접근권한 부여가 먼저 필요.

---

## ✅ 종합 검증 세션 — PSI 클라이언트 실제 결함 2건 발견·수정(2026-08-19)

Phase 2(4-A+4-B) 코드 완료 선언 직후, 사용자 요청으로 지금까지 구현된 전체 기능을 정상/예외/잘못된
입력/경계값/실패 상황 기준으로 재검증했다. `psi-client.ts`를 적대적으로 재검토하며 "재현 테스트 먼저
작성 → 실패 확인 → 수정 → 재검증" 순서로 진행해 실제 결함 2건을 찾았다(추측이 아니라 실패하는 테스트로
먼저 증명한 뒤 고침).

1. **API 키 마스킹 우회(보안, M4)**: 공백·`+` 등 URL-비안전 문자가 섞인 키를 쓰면, 에러 메시지에
   실제 요청 URL이 그대로 담기는 경우(예: 네트워크 오류) `encodeURIComponent`로 인코딩된 키 형태가
   원본과 달라져 마스킹을 통과해버렸다. 재현 테스트로 확인 후, 원본 키뿐 아니라 인코딩된 형태도 함께
   지우도록 `maskApiKey`를 수정. 실사용 Google API 키(영숫자+`-`/`_`만)는 인코딩해도 원본과 동일해
   실무 영향은 낮지만, 방어적 입력을 신뢰하지 않는다는 이 저장소의 원칙(M5)상 방치할 이유가 없어 수정.
2. **API 응답 타입 미검증(M5 입력 불신 검증)**: `percentile` 값이 예상과 다른 타입(문자열 등)으로 와도
   그대로 통과시켜 `lcpMs`에 문자열이 들어갈 수 있었다(선언된 타입 `number | null` 위반) — 이후
   `report/markdown.ts`의 `Math.round()`가 `NaN`을 만들어 리포트가 조용히 깨질 수 있는 경로였다.
   재현 테스트로 확인 후 `readPercentile()` 타입가드를 추가해 유한수가 아니면 항상 null로 처리하도록
   수정(추측 금지 원칙 그대로 적용).
3. **부수 개선(버그는 아님)**: PSI 응답 크기 상한을 5MB→20MB로 상향 — `lighthouseResult`에 포함되는
   스크린샷 썸네일 등으로 정상 응답이 5MB를 넘어 조용히 실패할 수 있는 여지를 없앰(`crawler/fetch-client.ts`의
   기존 전역 상한과 통일).

**검증 범위(전부 실제 실행)**: typecheck·build·`npm audit`(0건)·전체 스위트 65개 파일 **457개
테스트 전부 통과**(신규 2개 포함, 기존 455개 전부 회귀 없음). MCP 서버 툴 등록·연결 테스트
(`server-integration*.test.ts`) 재실행으로 이번 수정이 `/seo-audit` 실제 호출 경로를 깨지 않음을
별도 확인. lint는 이 저장소에 설정 자체가 없어 미실행(건너뛴 것이 아니라 대상이 없음).

**미실행(정직하게 명시)**: 실제 `PAGESPEED_API_KEY`로의 라이브 호출, Mac/Linux 실기기 실행 — 전부
사람 전용으로 이미 추적 중.

---

## ✅ noindex 제거 gated fixer 신규 구현 — R-NOINDEX-DETECTED (2026-08-20)

**배경**: 위 종합 검증 세션 직후, 사용자가 "PRD 재대조 → 다음 작업 방향 제안" 요청. `.PRD/03_PHASES.md`
Phase 1.5 원문(line 70)이 gated 자동수정 대상으로 **"canonical/noindex/robots/sitemap/JSON-LD/
title/meta/alt"** 7가지를 명시했는데, 실제 코드(`fixers/registry.ts`)를 직접 대조한 결과 canonical·
sitemap·robots(신규파일)·OG는 구현됐지만 **noindex는 탐지(`R-NOINDEX-DETECTED`)만 되고 수정기가 아예
없었다** — Phase 1.5가 "완료"로 표시된 이후 지금까지 한 번도 채워지지 않은 실제 갭. title/meta 자동
생성은 "빈 값에 무슨 문구를 넣을지"가 SEO 카피라이팅 판단(값 발명 위험)이라 별도 제품 결정이 필요하다고
보고 이번 스코프에서 제외 — noindex 제거만 진행(사용자 승인).

**왜 안전한가(값 발명 없음 원칙 적용)**: title/meta와 달리 noindex 제거는 이미 소스에 박혀 있는
`robots.index: false`라는 boolean 리터럴을 `true`로 뒤집는 것뿐이라 새 문구를 지어낼 필요가 전혀 없다.
canonical-fixer.ts/og-fixer.ts와 완전히 동일한 정적분석(ts-morph) + fail-closed 원칙을 그대로 적용:
- `robots` 필드 자체가 없음(레이아웃 등에서 상속됐을 수 있음) → report_only
- `robots`가 문자열(`"noindex, nofollow"` 등)이거나 `index`가 변수·함수호출 → report_only
- `robots`·`index` 어디든 스프레드가 섞임 → report_only
- **`robots.googleBot`이 별도로 존재함** → report_only (⚠️ 설계 중 발견한 위험: Google은 googleBot
  전용 메타태그를 일반 robots 태그보다 우선 적용하므로, top-level `index`만 고치면 "고쳤다"고 보고하지만
  실제로는 Googlebot 기준 noindex가 그대로 남는 **거짓 성공**을 만들 수 있었다 — fail-closed로 제외)

**구현**:
- `fixers/noindex-fixer.ts`(신규) — `planNoindexFix(filePath)`/`writeNoindexFix(filePath, text)`.
- `fixers/registry.ts` — `{ruleId: "R-NOINDEX-DETECTED", riskLevel: "gated"}` 등록.
- `fix-orchestrator/plan.ts` — `planNoindexFixForFinding` 추가(canonical과 동일하게 `findPageFilePath`로
  URL→소스파일 매핑, 추가 파라미터 불필요).
- `fix-orchestrator/apply.ts` — `applyNoindexFix` 추가(canonical과 완전히 동일한 스켈레톤: TOCTOU
  재검증→백업→쓰기→`next build`재검증→실패 시 `revertViaGitCheckout`). rollback.ts는 무변경(기존
  backup_path 기반 범용 롤백이 그대로 적용됨 — R-AI-CRAWLER-POLICY 때와 달리 "기존 파일 수정"이라
  특별 분기 불필요).

**검증**:
- 신규 유닛 테스트 12개(`noindex-fixer.test.ts`) — false→true 교정, follow 등 다른 필드 보존, 이미
  true면 멱등, robots 부재/문자열/변수/스프레드/googleBot오버라이드/동적함수 전부 report_only 폴백,
  파일 없음. 전부 통과.
- 신규 통합 테스트 4개(`fix-orchestrator-noindex-integration.test.ts`, 실제 `next build` 사용,
  격리된 임시 git repo) — (a) 미승인 시 apply가 절대 안 건드림 (b) 승인→적용→build 통과→
  `index:true`로 실제 반영→rollback으로 `index:false` 원복 (c) 거부 시 안 건드림 (d) 재실행해도
  중복 fix 안 만듦(멱등, 렌더된 페이지도 더 이상 noindex 아니라 finding 자체가 재발생 안 함). 전부 통과.
- `fixer-registry.test.ts`에 회귀가드 1건 추가(R-NOINDEX-DETECTED가 실수로 add_safe로 완화되는 것 방지).
- 전체 스위트 재실행: **67개 파일 474개 테스트 전부 통과**(기존 457 + 신규 17), 회귀 0건.
- typecheck 0에러 · build 0에러 · `npm audit` 워크스페이스 전체 0건.
- `npm run package:plugin` 재생성 후 `registry.js`/`plan.js`/`apply.js`에 `R-NOINDEX-DETECTED` 반영
  확인, `noindex-fixer.js` 배송 폴더에 존재 확인.

**남은 것(정직하게 명시)**: title/meta-description 자동생성 fixer는 이번에 의도적으로 보류(값 발명
위험이 있는 별도 제품 결정 필요 — "영구히 report_only로 둘지, 사람이 매번 검수하는 흐름을 새로 설계할지"
사용자 확인 필요). JSON-LD "생성"(검증은 이미 구현됨, `R-JSONLD-MISSING`은 여전히 탐지만 됨)도 이번
스코프 밖. **PRD의 Phase 1 자체 최우선 성공기준인 "실사용 재검증"(새 세션에서 마켓 설치→`/seo-audit`
실제 실행 확인)은 2026-07-18 이후 지금까지 한 번도 수행된 적이 없다 — 이 항목은 사람 전용이라 AI가
대신할 수 없고, 이번 세션에서도 여전히 미해결로 남아있음을 다시 명시한다.**

---

## ✅ PRD 전수 대조 감사 + 실제 결함 2건 발견·수정(2026-08-20)

병렬 서브에이전트 3개로 PRD 전체(보안 M1~M11·"절대 하지 마", Phase 1/1.5/2 성공기준, 법률·문서화
L1~L15)를 코드와 직접 대조했다. 대부분 실측 확인(SSRF 3중 방어·크롤 안전장치 수치 정확 일치·문서화
과잉 충족 등 — 강점 재확인, 수정 불필요). **실제 결함 2건**을 새로 발견해 그중 안전하게 처리 가능한
것부터 즉시 수정했다.

### 1. DISCLAIMER.md 라이선스 문구 낡음 — 수정 완료
`packages/plugin/DISCLAIMER.md`의 "라이선스 상태" 절이 여전히 "권장 MIT, 최종 확정 전"이라고 적혀
있었다(직전 세션의 "잔존 MIT 표기 정정" 커밋이 이 파일 하나를 놓친 것으로 보임). 실제 라이선스는
2026-08-10 Apache-2.0으로 이미 확정(README.md §14·LICENSE 파일과 일치). 배송 폴더의 실사용자 노출
문서라 우선순위를 높여 즉시 수정.

### 2. GitHub PR 모드가 gated fixer 4종을 전혀 반영 못 하던 실제 결함 — 재설계로 수정
`github/orchestrator.ts`는 스스로 "gated fixer가 생기면 재검토 필요"라고 예고해둔 주석을 갖고
있었는데, 그 사이 gated fixer가 4종(canonical/OG/noindex/robots.ts)이나 생겼음에도 재검토가 안
돼 있었다 — PRD 시나리오 D("add_safe 자동 / 색인영향은 승인 후 PR")의 절반이 조용히 빠진 채
방치돼 있던 것.

**재설계 결론**: 로컬 모드는 승인 즉시 사용자 디스크에 파일이 반영되므로 대화형 승인이 꼭 필요하지만,
GitHub 모드는 전제가 다르다 — 여기서 만드는 모든 변경은 **PR(제안)일 뿐**이고 사람이 명시적으로
머지해야만 실제 저장소에 반영된다(자동 머지는 이미 완전히 차단돼 있음). 즉 **GitHub 모드에서는 PR
자체가 이미 "diff 승인" 절차**다. 그래서 gated fix를 github 저장소 캐시 전용 DB 안에서만
`approved`로 전이시켜, 로컬 모드와 완전히 동일한 `applyLocalFixes`(TOCTOU 재검증·백업·build
재확인·롤백)를 그대로 재사용하게 했다. 사용자의 로컬 프로젝트 승인 이력과는 완전히 분리된 DB라
혼동 위험 없음.

**함께 고친 부수 결함**: PR 본문(`buildPrContent`)이 "계획된" 목록을 그대로 썼는데, 이는 build
실패로 롤백된 항목까지 PR 설명에 포함시켜 "설명과 실제 diff가 어긋나는" 신뢰 문제를 안고 있었다
(자동수정 1종뿐이던 예전엔 드러나지 않았던 결함). gated까지 포함하며 위험이 커져 함께 수정 —
이제 PR 본문은 **실제로 diff에 반영된(성공한) fix만** 나열한다.

**server.ts 리포트 문구도 동기화**: `seomedic_fix_github` 도구 설명과 결과 리포트에서 "gated 항목은
자동 적용 안 함/보고만"이라던 낡은 문구를 제거하고, "PR에 포함된 승인 필요 항목"(실제 diff 반영분)과
"적용하지 못한 항목"(build 실패 등)을 `result.applied`와 `fix.id`로 정확히 대조해 구분 표시하도록
변경(`GithubFixResult.gatedFindings: FindingRecord[]` → `gatedFixes: PlannedFix[]`로 타입도 변경,
fix.id 대조가 가능하도록).

**검증**:
- 기존 github-orchestrator 테스트 재실행 중 실제로 이 변경의 효과가 드러남 — 공유 픽스처(`app/robots.ts`
  없음)가 이미 R-AI-CRAWLER-POLICY(gated) finding도 만들고 있었는데, 예전엔 조용히 버려지던 게 이제
  `result.applied`에 2건(sitemap add_safe + robots.ts gated) 모두 잡힘. 기존 테스트 기대값을 이
  실제 동작에 맞게 갱신(회귀 아님 — 의도한 동작 변화).
- 신규 테스트 1개 추가: gated fix가 실제로 승인 전이되고, **가짜 GitHub 대신 실제 로컬 git 저장소로
  push된 브랜치를 직접 `git show`로 열어** robots.ts 내용이 실제로 반영됐는지 확인(반환값만 믿지
  않고 실제 git 상태로 검증).
- 전체 스위트 재실행: **67개 파일 475개 테스트 전부 통과**(기존 474 + 신규 1), 회귀 0건.
- typecheck 0에러 · build 0에러 · `npm audit` 워크스페이스 전체 0건.
- `npm run package:plugin` 재생성 완료.

**남은 것(정직하게 명시)**: 여러 rule_id가 섞일 때 브랜치를 1개로 유지할지 rule_id별로 나눌지는
`orchestrator.ts` 주석에 "이번 변경 범위 밖"으로 명시적으로 남겨뒀다(지금은 기존과 동일하게 감사당
브랜치 1개 유지 — duplicate-guard·PR 개수 정책까지 함께 바뀌어야 하는 별도 설계 과제). fork(남의
저장소) 경로의 실제 GitHub PR 생성 단계는 여전히 미검증(기존부터의 한계, 변동 없음). PRD 최우선
성공기준인 "실사용 재검증"도 여전히 미해결.

---

## ✅ GitHub PR 모드 재설계 스트레스 테스트 — gated 여러 개 동시 충돌 검증(2026-08-20)

바로 위 GitHub PR 모드 재설계(gated fixer가 PR에 반영되도록 바꾼 것) 직후, 새 기능을 더 추가하는
대신 **방금 만든 코드 자체를 더 혹독한 시나리오로 재검증**했다. 기존 테스트는 gated 항목이 딱
1개(robots.ts)뿐인 경우만 확인했는데, 실무에서 흔한 "한 페이지에 gated 문제가 여러 개 동시에 있는"
경우는 검증된 적이 없었다.

**시나리오**: 홈페이지 하나에 canonical 누락(`R-CANONICAL-MISSING`)·noindex(`R-NOINDEX-DETECTED`)·
OG 누락(`R-OG-BASIC-MISSING`) 3개를 동시에 심고, 기본 픽스처가 원래 robots.ts가 없어 자연히 발생하는
`R-AI-CRAWLER-POLICY`(별도 파일)까지 더해 **gated 4종, 파일 2개(`page.tsx`+`app/robots.ts`)**가
한 번에 한 PR로 합쳐지는 조합을 만들었다.

**우려했던 위험**: `page.tsx` 하나를 3개의 서로 다른 fixer(canonical/noindex/OG)가 순서대로 다시
읽고 다시 쓰는데, 뒤에 적용되는 fixer가 앞서 이미 반영된 변경을 덮어쓰거나 지워버릴 가능성.

**결과**: 실제 로컬 git 브랜치를 `git show`로 직접 열어 확인한 결과, **첫 시도에 통과** —
`title`(원래 값 보존) + `alternates.canonical`(추가) + `robots.index: true`(교정) +
`openGraph.title`(추가) 4개 변경이 전부 한 파일에 정확히 누적 반영됐고, `app/robots.ts`도 같은
PR에 함께 들어갔다. `applyLocalFixes`가 fix를 순차 처리하며 매번 디스크에서 파일을 새로 읽는
TOCTOU 재검증 설계(각 fixer가 이미 이전 fixer의 변경이 반영된 최신 파일 상태를 보고 자기 필드만
추가/교정) 덕분에 충돌이 구조적으로 발생하지 않음을 실증했다 — 추측이 아니라 실제 git 상태로 확인.

**검증**: 신규 테스트 1개, 전체 스위트 **67개 파일 476개 테스트 전부 통과**(기존 475 + 신규 1,
회귀 0). typecheck·build·`npm audit` 전부 이상 없음. 이번엔 소스 코드 변경이 없어(테스트만 추가)
플러그인 번들 재생성 불필요.

**결론**: 방금 배포한 GitHub PR 모드 재설계는 여러 gated 문제가 겹치는 더 어려운 실제 시나리오에서도
안전하게 동작함이 확인됐다. 남은 위험(브랜치 1개에 여러 rule_id가 섞여 저장소 관리자가 "일부만
선택 승인"할 수 없는 점)은 기존에 이미 "이번 변경 범위 밖"으로 명시해둔 것과 동일한 사안이며, 이번
검증으로 새로 발견된 문제는 없다.

---

## ✅ GitHub PR 모드 — 위험도별 PR 2개 분리(safe/review) + 실제 버그 1건 발견·수정(2026-08-20)

사용자가 title/meta 자동생성(대화 승인형)·GitHub PR 브랜치 분리 중 **브랜치 분리를 먼저** 진행하기로
확정(AskUserQuestion). 위 스트레스 테스트가 남겨둔 "브랜치 1개에 여러 위험도가 섞여 일부만 선택
승인 못 함" 문제를 해소했다.

### 설계 결정 — 왜 "한 clone에서 두 브랜치"가 아니라 "완전히 독립된 두 clone"인가
같은 작업 폴더에서 브랜치를 오가며 파일별로 골라 커밋하는 방식도 가능했지만, "브랜치 A 커밋 후
되돌리고 브랜치 B 시작" 단계가 불완전하면(git clean 누락 등) B에 A의 변경이 조용히 섞여 들어갈
위험이 있다. **매 위험도(bucket)마다 완전히 새로 clone**하면 이 위험이 구조적으로 없다 — 대신
clone·npm install·next build가 두 번(bucket마다 한 번씩) 실행돼 전체 소요시간이 늘어난다. 이
프로젝트가 반복해서 택해 온 "속도보다 안전" 원칙을 그대로 따랐다(fixer 파일마다 로직을 의도적으로
중복시켜 서로 건드리지 않게 한 것과 같은 판단). 두 bucket을 병렬로 돌리지 않은 이유도 같다 — 로컬
렌더 브릿지 서버가 동시 실행에도 안전한지 검증된 적이 없어, 이번엔 순차 실행으로 확실한 쪽을 택했다
(속도 개선은 검증 후 별도 과제로 남김).

브랜치명은 `rule_id`가 아니라 **위험도 자체로 고정**했다(`seomedic/fix-safe` / `seomedic/fix-review`)
— 어떤 rule_id 조합이 섞이든 항상 결정론적이라 브랜치가 계속 늘어나지 않고, "여러 rule_id가 섞일 때
브랜치를 어떻게 나눌지"라는 기존 미해결 설계 질문 자체가 자연히 해소됐다.

### 구현
- `github/orchestrator.ts` 전면 재작성: 공통 전처리(정책 확인·fork/own 판별)는 한 번만 수행하고,
  `runFixBucket()`(신규 private 함수)을 risk_level별로 두 번 호출. `GithubFixResult`가
  `{targetRef, policyWarnings, safe, review}`로 바뀜(각 `GithubFixBucketResult`는 이전 단일
  결과와 같은 필드 구성).
- `server.ts`: `seomedic_fix_github` 결과 렌더링을 `renderGithubFixBucket()` 헬퍼로 두 번(safe/review)
  호출하도록 재작성. 도구 설명 문구도 "PR 2개 분리" 사실 반영.

### 재현 테스트로 발견한 실제 버그(중요)
테스트를 실제로 돌리는 과정에서 **review bucket의 PR에 add_safe 변경이 조용히 섞여 들어가는 버그**를
발견했다 — 두 bucket이 완전히 독립된 clone에서 각자 `planLocalFix`를 새로 돌리다 보니, review
bucket의 clone에도 원본 저장소에 실재하는 add_safe 문제(sitemap 누락)가 **독립적으로 또 발견**되고,
그 fix는 `approval_status='auto'`라 `applyLocalFixes`가 무조건 적용 대상으로 집어버렸다(내가 report용
으로만 나눈 "이 bucket이 무엇을 신경 쓰는지" 구분은 실제 적용 로직에 전혀 반영되지 않고 있었음).
- **근본 수정**: `fix-orchestrator/apply.ts`의 `applyLocalFixes`에 `onlyFixIds?: number[]` 옵션을
  추가(하위호환 — 안 넘기면 기존과 완전히 동일하게 동작, 로컬 모드는 무변경). GitHub 모드의
  `runFixBucket`이 이제 자기 bucket에 속한 fix id만 명시적으로 넘겨 적용을 제한한다.
- 이 버그는 **재현 테스트가 먼저 실패해서** 잡혔다(추측이 아니라 `expect(result.review.applied)
  .toHaveLength(1)`이 실제로 2로 나와 실패 → 원인 추적 → 수정 → 재실행 통과 확인).

### 검증
- 신규/전면 재작성 테스트 5개(safe/review 완전 분리 실증, review 4종 스택, 정책차단, **bucket별
  독립 중복방지**(safe만 중복이어도 review는 독립적으로 정상 진행), fork 경로) — 전부 실제 로컬 git
  브랜치 내용을 직접 `git show`로 열어 확인(safe 브랜치엔 gated 변경이 전혀 없음을 `git cat-file -e`
  로도 재확인).
- 전체 스위트 **67개 파일 475개 테스트 전부 통과**(기존 476 − 통합된 테스트 1개 + 재작성, 회귀 0).
- typecheck 0에러 · build 0에러 · `npm audit` 워크스페이스 전체 0건 · `npm run package:plugin` 재생성 완료.

**남은 것(정직하게 명시)**: 두 bucket 순차 실행이라 GitHub 모드 전체 소요시간이 늘어남(설계 결정,
위 설명 참고) — 병렬화는 렌더 브릿지 동시실행 안전성 검증 후 별도 과제. title/meta 자동생성(대화
승인형)은 다음 순서로 확정됐으나 이번 라운드에서 미착수. PRD 최우선 성공기준인 "실사용 재검증"도
여전히 미해결.

---

## ✅ CI가 실제로 잡아낸 Windows 실결함 — sandbox 정리 EBUSY 레이스 수정(2026-08-20)

바로 위 커밋(위험도별 PR 분리)을 push한 뒤 CI를 지켜보던 중, **직전 커밋(스트레스 테스트 추가)의
CI가 windows-latest에서 4개 테스트 실패**로 끝난 것을 발견했다. 로컬(3-OS 전부 포함해 이번 세션
내내 반복 실행)에서는 단 한 번도 재현되지 않았던 문제라, 추측하지 않고 실패 로그를 GitHub API로
직접 받아 원인을 확인했다.

**원인(로그로 직접 확인, 추측 아님)**: `Error: EBUSY: resource busy or locked, rmdir
'...seomedic-github-sandbox-...'` — `github/sandbox.ts`의 `cleanup()`이 `fs.rmSync(tempDir,
{recursive:true, force:true})`로 sandbox 임시폴더를 지우는데, Windows에서는 방금 종료한 자식
프로세스(`next build` 등)가 파일 핸들을 완전히 놓기 전에 rmdir을 시도하면 이 오류가 난다 — 잘 알려진
Windows/Node 레이스 컨디션이다. gated fixer가 여러 개로 늘면 sandbox 하나에서 `next build`를 여러
번 도는 시나리오가 생겨(스트레스 테스트가 정확히 이 조건), 처음으로 CI 로그에 실제로 드러났다.
4번째 실패("policy가 차단하면" 테스트가 30초 타임아웃)는 별도 버그가 아니라, 앞선 3개 실패로 러너가
느려진 부수효과로 판단(정책 검사만 하고 끝나는 이 테스트가 원래 실패할 이유가 없는 로직이라서).

**⚠️ 정직하게 명시**: 이 문제는 간헐적(flaky)이다 — 바로 다음 커밋(위험도별 PR 분리, sandbox 접근이
오히려 2배로 늘었음)의 CI는 수정 없이도 3-OS 전부 통과했다. 재현이 안 됐다고 "문제 없음"으로
넘기지 않고, 실패 로그로 원인이 명확한 이상 수정을 진행했다 — 간헐적 실패도 실제 버그다.

**수정**: `fs.rmSync`/`fs.promises.rm` 호출에 Node 공식 문서가 이 정확한 문제(Windows에서 백신 등
보안 소프트웨어가 파일을 일시적으로 잠글 수 있음)를 위해 제공하는 `maxRetries: 5, retryDelay: 300`
옵션을 추가했다(직접 재시도 루프를 짜지 않고 이미 검증된 표준 메커니즘 사용). 프로덕션 `cleanup()`은
이미 async 컨텍스트라 `fs.promises.rm`으로 바꿔 재시도 대기가 이벤트 루프를 막지 않게 했다. GC/종료
핸들러의 나머지 두 곳(`gcOrphanedSandboxes`, 프로세스 종료 시그널 핸들러)도 동일하게 반영.

**검증**: `github-sandbox.test.ts`·`github-orchestrator.test.ts` 재실행(10개 테스트 통과) + 전체
스위트 재실행 **67개 파일 475개 테스트 전부 통과**(회귀 0). typecheck 0에러. 로컬에서 EBUSY 자체를
재현하지 못해(Windows CI 러너와 로컬 환경의 타이밍 차이로 추정) 이 수정이 실제로 간헐적 실패를
없애는지는 **다음 CI 실행들에서 계속 지켜봐야 확인 가능** — 근거 없이 "완전히 고쳤다"고 단정하지 않는다.

---

## ✅ 마켓 캐시 재검증 준비 — plugin.json 버전 재범프 + 실사용 재검증 체크리스트 최신화(2026-08-20)

**배경**: PRD 5문서(`01_PRD.md`~`04_PROJECT_SPEC.md`)와 이 파일 전체를 사용자 요청으로 전수 재대조한
뒤 "지금 가장 시급한 다음 작업"을 강력 추천했고, 사용자가 승인해 진행했다. 새 기능 추가보다 이 항목을
우선한 근거: `.PRD/03_PHASES.md:33`가 정의한 Phase 1 성공기준("마켓 플러그인으로 설치 → 다른
프로젝트에서 `/seo-audit` 실행 검증")이 2026-07-18 이후 지금까지 **다섯 차례 세션에서 연속으로
"여전히 미해결"**로 재확인된 유일한 항목이고, 이 프로젝트는 "코드 완료 = 실사용 성공"이 아니라는 걸
서로 다른 3개 독립 원인(npm 미배포 / plugin.json 버전캐시 / Windows `ensure-mcp-deps.mjs` EINVAL)으로
이미 세 번 겪었기 때문이다.

**착수 전 발견한 사실(추측 아님, git log로 직접 확인)**: `plugin.json` 버전이 2026-08-09(`be1b4fc`,
0.1.0→0.1.1) 이후 **한 번도 안 올랐는데**, 그 사이 실질적 코드 변경이 최소 7건(EINVAL 수정·
AI크롤러정책 fixer·PSI연동+버그수정 2건·noindex fixer·GitHub PR gated반영·GitHub PR 위험도분리·
EBUSY 수정) 있었다. 이건 위 "M9 이후 재발견" 절이 근본원인 #1로 이미 기록한 것과 **정확히 같은
조건**이다 — 버전을 먼저 올리지 않고 지금 실사용 재검증을 하면 마켓 캐시가 옛 버전(0.1.1)을 그대로
쓸 위험이 있어, 검증 결과 자체를 신뢰할 수 없다고 판단했다.

**조치**:
- `packages/plugin/.claude-plugin/plugin.json` — `"version": "0.1.1"` → `"0.1.2"`.
- 검증: JSON 문법 확인(`node -e "JSON.parse(...)"`) 통과 · `claude plugin validate packages/plugin
  --strict` 통과 · `npm run typecheck --workspace=packages/mcp-engine` 0에러(순수 메타데이터
  변경이라 TS 소스 영향 없음 — 직전 커밋 `b3797d8`이 이미 CI 3-OS 그린으로 확정돼 있어 전체
  스위트 재실행은 이번 변경 범위에서 불필요로 판단).
- 저장소 전체에서 `0.1.1` 잔존 참조 재확인(grep) — 이 파일의 과거 이력 기록 1건(2026-08-09 항목,
  역사적 사실이라 의도적으로 그대로 둠) 외 없음.

**실사용 재검증 체크리스트 최신화** — 위 "다음 작업 — 실사용 재검증(2026-08-04)" 절의 6단계 절차
자체는 여전히 유효해 재작성하지 않고, **오늘 기준으로 달라진 부분만** 아래에 추가한다.

### 2026-08-04 시점 대비 달라진 것
- plugin.json 버전 0.1.1 → **0.1.2**(이번 조치) — 마켓 캐시가 최신 번들을 받을 조건이 이제 충족됨.
- `@hono/node-server` 2.x 메이저업 리스크 — 그 이후 여러 세션 CI가 3-OS 그린으로 반복 통과해 실질
  위험은 낮음으로 재평가(단, 실사용 확인은 여전히 안 됨 — 완전히 해소됐다고 단정하지 않는다).
- Windows `ensure-mcp-deps.mjs` EINVAL 버그(2026-08-19 발견·수정) — **이번이 이 수정 이후 첫
  실사용 검증**. 기존 위험표의 "MCP 연결 자체가 또 실패" 항목은 이제 이 원인까지 포함해 봐야 한다.
- 기능 범위 확장 — noindex 제거 fixer·AI크롤러정책 fixer·GitHub PR 위험도별 분리(safe/review 2개
  PR)가 전부 이번 검증 대상에 새로 포함됨. 6단계 절차의 "5. 실제 URL로 진단 요청"은 여전히 최소
  기준(연결 자체 확인)이며, 여유가 되면 로컬 Next.js 픽스처로 `/seo-fix` gated 승인 흐름까지 함께
  확인하면 더 좋다(필수는 아님 — 연결 확인이 이번 검증의 최소 목표).

### done-when (불변)
새 Claude Code 세션에서 `/plugin uninstall` → 재설치 → `/reload-plugins`에서 에러 없음 →
`/seo-audit https://example.com` 실행 시 "MCP 도구가 연결되지 않았습니다" 없이 실제 진단 리포트가
반환된다. 이 조건이 처음으로 충족되면 `.PRD/03_PHASES.md:33`가 실측 근거와 함께 체크되고, Phase 1이
문자 그대로 완결된다.

**남은 것**: 위 done-when 충족 여부 확인은 **사람 전용**이라 AI가 대신할 수 없다. 이번 세션은 그
직전 단계(버전 재범프 + 체크리스트 최신화)까지만 처리했다.

---

## ✅ GSC/GA4 실 client 구현(1차) — 인증·REST 호출 레이어만, orchestrator/report 배선은 의도적 보류(2026-08-20)

**배경**: 사용자 요청으로 PRD를 다시 전수 대조해 "다음 Phase" 후보를 재검토했다. 처음엔 title/meta
자동수정·alt 생성·JSON-LD **생성**(탐지는 이미 있음)·GSC/GA4 실연동 4가지를 후보로 제시했으나, 실제
착수 전 코드를 직접 열어보고 위험도를 재평가한 결과가 최초 판단과 달랐다 — 아래에 정직하게 기록한다.

### 착수 전 재평가로 JSON-LD 생성 fixer를 이번 라운드에서 제외한 이유
canonical/OG/noindex/robots.ts 등 지금까지의 모든 gated fixer는 전부 **`export const metadata` 객체
리터럴을 ts-morph AST로 편집**하는 동일한 패턴이었다. JSON-LD는 다르다 — Next.js 메타데이터 API에는
JSON-LD 전용 필드가 없어, 공식 권장 방식은 페이지의 **JSX 렌더 트리에 `<script type="application/
ld+json">`을 직접 삽입**하는 것뿐이다. 임의의 `page.tsx` 구조에서 삽입 위치를 일반적으로 안전하게
찾는 문제는 지금까지 이 프로젝트가 풀어온 "metadata 객체 편집"과 근본적으로 다른, 더 어려운 문제다.
title/meta가 "값 발명 위험"으로 보류된 것과 같은 이유로, 이것도 설계를 더 좁힌 뒤(예: 임의 페이지가
아니라 루트 layout 1곳에만 site-wide Organization/WebSite 스크립트를 넣는 등) 별도 라운드에서
다루는 게 맞다고 판단해 이번엔 손대지 않았다.

### GSC/GA4 실 client — 이번에 완료한 것
`integrations/types.ts`의 `GscClient`/`Ga4Client` 포트(2026-08-19 이전 세션이 이미 설계·
`fake-clients.ts`로 검증까지 마쳐 둔 인터페이스, 실 구현만 비어 있던 자리)를 실제로 채웠다:

- **`integrations/google-auth-token.ts`**(신규) — 서비스계정 JWT→OAuth2 액세스 토큰 교환은 손으로
  짜지 않고 Google 공식 `google-auth-library`(Apache-2.0, 신규 의존성)로 위임한다. `keyFile`을 항상
  명시적으로 넘겨 GoogleAuth의 Application Default Credentials 자동탐색(그 경로 중 하나가 **GCP
  메타데이터 서버 169.254.169.254** — 이 프로젝트의 SSRF 방어(M1)가 우리 자신의 크롤러에서 명시적으로
  차단하는 그 주소)을 원천 차단.
- **`integrations/gsc-client.ts`**(신규) — Search Console `searchAnalytics.query`(공식 문서
  `developers.google.com/webmaster-tools/v1/searchanalytics/query`를 이번에 직접 fetch해 엔드포인트·
  요청/응답 스키마 확인, 추측 없음). `dimensions: []`로 호출하면 기간 전체 집계 행 1개만 반환됨을
  확인해 별도 합산 로직 없이 그대로 사용.
- **`integrations/ga4-client.ts`**(신규) — GA4 Data API `runReport`(공식 문서 직접 fetch로 확인).
  응답의 `metricValues`가 전부 **문자열**로 온다는 점(공식 응답 예시로 확인)을 반영해 타입 검증 후
  파싱(M5). `propertyId`는 PRD 환경변수 표(`GA4_PROPERTY_ID`)와 일치하게 "properties/" 접두사 없는
  순수 ID를 받고, 클라이언트가 REST 경로에 접두사를 붙인다 — 이 판단은 테스트를 먼저 잘못 짜서
  실패한 뒤(접두사가 중복 삽입됨) 발견·수정했다(재현 테스트로 잡힘, 추측이 아니라 실패가 알려줌).
- **`crawler/fetch-client.ts`**(확장, 기존 파일) — `safeFetch`가 지금까지 GET 전용이었는데(PSI까지는
  충분했음), GSC/GA4는 POST+JSON body+Authorization 헤더가 필요해 `SafeFetchOptions`에
  `method`/`headers`/`body`를 추가했다(전부 optional, 기본값 GET 유지 — 기존 호출부 전부 무변화,
  하위호환). SSRF 가드·리다이렉트 재검증·크기상한은 GET과 동일하게 그대로 적용된다.
- 둘 다 **DI 이중 계층**(fetcher + tokenProvider)으로 설계해 실제 서비스계정·네트워크 없이 canned
  토큰·canned 응답만으로 전부 테스트했다(psi-client.ts와 동일 원칙 — Google 서버 호출은 느리고
  비결정적이라 CI 부적합).

### 왜 이번 라운드에서 audit-orchestrator/report 배선까지 안 했는가(의도적 축소)
PSI 때는 client+토큰+orchestrator+report 4곳을 한 라운드에 다 했지만, 이번엔 client+토큰 레이어까지만
멈췄다. 이유: (1) GSC/GA4는 PSI(단순 API 키 GET)와 달리 OAuth 인증·신규 의존성·2개 API를 한 번에
새로 들여오는 라운드라 이미 위험 표면이 넓다. (2) report.ts/audit-orchestrator.ts는 **모든** audit
실행이 거치는 공유 코드라, 검증 안 된 새 배선을 서둘러 얹으면 회귀 위험이 이 client 코드 자체보다
오히려 report 쪽에 더 클 수 있다. (3) `HUMAN_ACTION_CHECKLIST.md`가 애초에 GSC/GA4를 "새 세션 인터뷰
권장"으로 분류해 뒀다 — 실제 리포트 문구·기본 조회 기간(28일로 정했으나 사람이 다르게 원할 수 있음)
같은 결정은 사람과 함께 정하는 게 안전하다고 판단해, 가장 불확실성이 컸던 "인증이 실제로 되는가"
부분부터 먼저 증명하고 멈췄다("작업을 작게 쪼갤수록 결과물이 좋아진다" 원칙 적용).

### 검증(전부 실제 실행)
- typecheck 0에러 · build 0에러.
- 전체 스위트 재실행: **70개 파일 497개 테스트 전부 통과**(기존 475 + 신규 22, 회귀 0).
- `npm audit --audit-level=high`(mcp-engine 워크스페이스): **0 vulnerabilities**.
- `license-checker --summary`(저장소 루트, 전체 재스캔): GPL/AGPL 등 카피레프트 **0건**(신규
  `google-auth-library`+전이 의존성 6개 전부 Apache-2.0/MIT/BSD — 확인 완료, M9-1/L2 재통과).
- `npm run package:plugin` 재생성 완료, 배포 번들에 신규 파일 3개 + `google-auth-library` 의존성
  반영 확인.

### 남은 것(정직하게 명시)
1. **audit-orchestrator.ts/report.ts 배선 미완료** — 지금은 `GscClient`/`Ga4Client` 실제 구현이
   존재할 뿐, 아무 데서도 호출되지 않는다(PSI처럼 audit 결과에 자동으로 섞이지 않음). 다음 라운드
   과제로 명시.
2. **실제 서비스계정 키로 단 한 번도 호출해 본 적 없다** — GSC 응답의 "가장 최근 1~2일 데이터
   불완전 가능성"·GA4 `metricValues` 문자열 파싱 둘 다 공식 문서 근거로만 구현했고 실제 응답으로
   재검증 전이다(PSI의 CLS 스케일링과 같은 성격의 미확인 사항). 사람의 서비스계정 발급이 먼저
   필요(`HUMAN_ACTION_CHECKLIST.md` 4-B 표).
3. plugin.json 버전은 이번엔 올리지 않았다 — 아무 사용자 경로에서도 이 새 코드가 아직 실행되지
   않아(도달 불가) 마켓 캐시 이슈와 무관하다고 판단(위 EBUSY 수정 라운드와의 차이점).
4. title/meta·alt·JSON-LD 생성은 여전히 미착수 — 전부 "값 발명 위험" 계열이라 별도 설계 승인 필요.

---

## ✅ GSC/GA4를 audit-orchestrator/report에 실제 배선(2026-08-20, 위 client 구현의 다음 라운드)

**배경**: 위 라운드가 "다음 과제"로 명시해 둔 orchestrator/report 배선을 진행하기 전, 착수 전 재검토
과정에서 **PSI 패턴을 그대로 베끼면 안 되는 이유**를 발견했다 — PSI는 실패를 완전히 침묵 처리하는데
(`audit-orchestrator.ts` 67~70행 주석에 이미 그렇게 명시돼 있음), GSC/GA4는 설정 실패 지점이 PSI(API
키 하나)보다 훨씬 많다(서비스계정 발급·권한 부여·속성 지정 등 최소 3곳). 완전 침묵이면 비개발자
사용자가 정성껏 설정했는데도 왜 안 되는지 알 방법이 전혀 없다 — 그래서 이번엔 **의도적으로 PSI와
다르게** 설계했다.

**추가로 착수 전 발견한 것 — 설정 방식 자체가 없었음**: `Integration` DB 엔티티(`property_scope`
필드)가 이미 설계돼 있지만, 이걸 채워주는 사용자 대면 경로(MCP 도구 인자든 뭐든)가 코드 어디에도
없었다(`insertIntegration` 호출부가 테스트 밖에 전혀 없음을 grep으로 확인). 지금 그 위에 새 입력
설계를 얹기보다, PSI가 이미 증명한 "env-only, Integration DB 안 거침" 패턴을 그대로 따르기로 했다.

### 구현
- **`integrations/gsc-token.ts`**(신규) — `GSC_SERVICE_ACCOUNT_PATH` + `GSC_PROPERTY_SCOPE`(신규 env
  var — PRD 표에 없던 걸 추가. PRD 이탈이 아니라 PRD가 못 채운 빈틈을 PRD 자신의 기존 패턴으로 메운
  것) 둘 다 있어야 활성. 하나만 있으면(부분 설정) 미설정과 동일하게 취급(fail-closed).
- **`integrations/ga4-token.ts`**(신규) — `GSC_SERVICE_ACCOUNT_PATH`(GSC와 서비스계정 공유, PRD 표에
  GA4 전용 경로가 따로 없음) + `GA4_PROPERTY_ID`.
- **`orchestrator/audit-orchestrator.ts`** — 크롤 루프 밖에서 audit 실행당 **딱 한 번**만 호출(GSC/GA4는
  페이지별이 아니라 사이트 전체 요약값이라 PSI의 페이지별 fieldData와 다른 지점). 성공하면
  `reportInput.gsc`/`ga4`에, 실패하면(설정은 됐는데 인증/호출 실패) **PSI와 다르게** 침묵하지 않고
  `reportInput.gscError`/`ga4Error`에 사유를 남긴다. 에러 메시지는 gsc-client.ts/ga4-client.ts가 이미
  Bearer 토큰을 마스킹해 반환하므로 그대로 리포트에 노출해도 안전하다(M4).
- **`report/types.ts`/`markdown.ts`/`json.ts`** — `AuditReportInput`에 `gsc?`/`gscError?`/`ga4?`/
  `ga4Error?` 추가(전부 optional — 기존 리포트 입력 전부 하위호환). 마크다운은 요약 바로 다음(페이지별
  섹션보다 앞)에 "검색 성과"/"방문자 통계" 표를 넣고, 실패 시엔 표 대신 경고문 한 줄만. 둘 다 미설정이면
  아무 것도 안 보여준다(선택 기능이 리포트를 어지럽히지 않음, YAGNI). JSON 스키마도 동일하게 확장.

### 검증(전부 실제 실행)
- typecheck 0에러 · build 0에러.
- **실제 end-to-end 배선 테스트**(`audit-orchestrator.test.ts`, 실제 example.com 크롤 포함) — 존재하지
  않는 키 파일 경로를 env var로 주입해 실제로 `runAudit()`을 끝까지 실행한 뒤, `reportInput.gscError`/
  `ga4Error`에 "인증 실패"가 실제로 담기는지 확인(가짜 client 주입이 아니라 진짜 `google-auth-library`
  실패 경로를 그대로 통과시킴 — 이 프로젝트가 선호하는 "실제 실행" 검증 방식).
- `report.test.ts`에 gsc/ga4 정상·미설정·실패 3가지 케이스를 markdown·json 양쪽에 신규 추가.
- `gsc-token.test.ts`/`ga4-token.test.ts` 신규(부분 설정=미설정 취급 fail-closed 검증).
- 전체 스위트 재실행: **72개 파일 516개 테스트 전부 통과**(기존 497 + 신규 19, 회귀 0).
- `npm audit --audit-level=high`: 0건.
- `plugin.json` 버전 **0.1.2→0.1.3**(이번엔 실제로 도달 가능한 코드 변경이라 필요 — 지난 라운드의
  "배선 안 해서 버전 안 올림" 판단과 정합적으로 대비됨) + `claude plugin validate --strict` 통과 +
  `npm run package:plugin` 재생성 완료.

### 남은 것(정직하게 명시)
1. **실제 서비스계정 키로 단 한 번도 안 돌려봤다** — env var 3개를 실제로 채워 넣고 진짜 리포트에
   숫자가 나오는지, 실패 경고문이 실제로 도움이 되는 문구인지는 사람 전용 검증(`HUMAN_ACTION_
   CHECKLIST.md` 4-B).
2. GSC 결과의 "가장 최근 데이터 불완전 가능성"·GA4 `metricValues` 문자열 파싱은 여전히 공식 문서
   근거로만 구현(지난 라운드에서 이미 명시한 한계, 변동 없음).
3. `GSC_PROPERTY_SCOPE`는 PRD 문서 자체에는 없는 신규 env var라 `HUMAN_ACTION_CHECKLIST.md`·README의
   환경변수 안내에 반영이 필요하다(이번 라운드는 코드만, 문서 갱신은 다음 과제로 남김).
4. 두 호출이 순차 실행이라(GSC → GA4) 둘 다 설정된 경우 audit 전체 소요시간이 조금 늘어난다 — 각각
   1~3초 내외로 예상되나 실제 계정으로 측정 전이라 확정 아님.

---

## ✅ JSON-LD 생성 fixer(R-JSONLD-WEBSITE-MISSING, 루트 레이아웃 한정) + README 정합성 수정(2026-08-20)

**배경**: PRD 재대조 후 "다음 Phase" 후보를 다시 검토하며, 지난 두 라운드에서 "위험해서 보류"라고만
말해온 JSON-LD 생성을 이번엔 실제로 ts-morph 프로토타입을 짜서 **되는지 안 되는지 직접 실험**했다.

### 착수 전 실험으로 확인한 것
- canonical/OG/noindex 등 기존 fixer는 전부 `export const metadata` **객체 리터럴**을 편집하지만,
  JSON-LD는 Next.js 메타데이터 API에 전용 필드가 없어(공식 문서 확인) 유일한 방법이 **JSX 렌더
  트리**에 `<script type="application/ld+json">`을 직접 넣는 것뿐이다 — 이 프로젝트에서 JSX를
  편집하는 첫 사례.
- ts-morph의 `JsxElement`에는 canonical-fixer.ts가 쓰는 `addPropertyAssignment` 같은 편의 메서드가
  없다(`insertJsxChild` 같은 것도 존재하지 않음, 실제 확인). 대신 `replaceWithText()`로 여는태그+
  기존자식+새script+닫는태그를 재구성하는 방식이 안정적으로 동작함을 in-memory 프로토타입으로
  실측 확인한 뒤에야 착수했다.
- **범위를 "루트 레이아웃 파일 1곳, `<body>`가 정확히 1개일 때만"으로 좁혔다** — 임의 페이지가
  아니라 App Router 규칙상 위치가 결정론적인 파일 하나뿐이고, 구조를 확신할 수 없으면(0개·2개 이상)
  전부 fail-closed로 손대지 않는다.

### 값 발명 금지 원칙 적용(추가로 발견한 함정)
처음엔 "site name + url" 둘 다 넣을 계획이었으나, 실제로 짜면서 **url 필드는 뺐다** — 이 파이프라인
어디에도 실제 배포 도메인이 없고(로컬 렌더 브릿지의 placeholder origin뿐), canonical-fixer.ts처럼
Next.js의 metadataBase 상대경로 해석에 기댈 수도 없다(raw JSON-LD 문자열이라 그런 해석 메커니즘
자체가 없음). 가짜 placeholder 주소를 사용자의 실제 JSON-LD에 박아 넣는 건 "값 발명"보다 나쁜
"틀린 값 주입"이라 판단해 뺐다 — schema.org WebSite 타입은 `name`만으로도 유효하다.

### 보안 hook이 잡아낸 실제 위험(무시하지 않고 수정)
`dangerouslySetInnerHTML` 사용에 보안 경고가 떴다 — 일반적으로는 공식 문서가 권장하는 JSON-LD
주입의 표준 패턴이라 안전하지만, 이번 경우엔 실제 위험이 있었다: siteName(이미 렌더된 title 복사값)
자체가 대상 사이트의 기존 취약점으로 오염돼 `</script>`를 포함할 가능성을 배제할 수 없고, 그러면
`JSON.stringify`의 일반 이스케이프로는 못 막는 HTML 파서 레벨의 조기 태그 종료(script breakout)가
가능했다. `<`를 `<`로 이스케이프해(유효한 JSON은 유지하면서) 막았다 — 재현 테스트로 검증.

### 사이트 전체 vs 페이지별 — 기존 R-JSONLD-MISSING과의 관계
R-JSONLD-MISSING(페이지별 탐지, 기존)은 그대로 두고 건드리지 않았다. 대신 sitemap·AI크롤러정책과
같은 "사이트 전체" 패턴을 따라 **크롤된 200 페이지가 전부 R-JSONLD-MISSING이면**(어디에도 JSON-LD가
전혀 없으면) 새 rule(`R-JSONLD-WEBSITE-MISSING`)로 finding을 하나만 만든다. 단 한 페이지라도 이미
JSON-LD가 있으면(수동으로 일부 넣어뒀을 수 있음) 건너뛴다 — 기존 의도적 작업과 충돌 방지. siteName은
홈페이지("/")의 렌더된 title을 그대로 복사(og-fixer.ts와 동일 원칙), 없으면 report_only.

### 구현
- `fixers/jsonld-website-fixer.ts`(신규) — `planJsonLdWebsiteFix`/`writeJsonLdWebsiteFix`.
- `fixers/registry.ts` — `R-JSONLD-WEBSITE-MISSING`을 gated로 등록.
- `fix-orchestrator/plan.ts` — 사이트 전체 부재 판정 + 루트 레이아웃 경로 resolver + finding/fix 생성.
- `fix-orchestrator/apply.ts` — `applyJsonLdWebsiteFix`(다른 4개의 "기존 파일 수정" fixer와 완전히
  동일한 스켈레톤 — robots.ts의 "신규 생성" 특수 분기와 달리 표준 백업/롤백 그대로 재사용).

### 검증(전부 실제 실행)
- 단위 테스트 9개(`jsonld-website-fixer.test.ts`) — 정상 삽입·기존 내용 보존·url 미포함·멱등·
  body 0개/2개 fail-closed·XSS 이스케이프까지 포함.
- 통합 테스트 4개(`fix-orchestrator-jsonld-website-integration.test.ts`, 실제 `next build` 포함,
  OG 테스트와 동일하게 title을 심은 격리 fixture 사용) — (a) 미승인 시 무변화 (b) 승인→적용→build
  통과→layout.tsx 실제 반영(url 필드 없음·`{children}` 보존 확인)→rollback 원복 (c) 거부 시 무변화
  (d) 재실행해도 중복 없음(멱등) + **R-JSONLD-MISSING이 다음 감사에서 더 이상 발화하지 않음까지 확인**
  (layout이 모든 페이지를 감싸므로 사이트 전체가 자연히 해소되는 emergent correctness).
- `fixer-registry.test.ts`에 회귀가드 1건 추가.
- **실제 회귀 발견·수정**: 전체 스위트 재실행 중 `github-orchestrator.test.ts`의 "gated 여러 개가
  겹치는" 스트레스 테스트가 깨졌다 — 그 테스트가 쓰는 픽스처(홈페이지에 canonical 없음·noindex·OG
  없음·robots.ts 없음을 의도적으로 심어둔 것)가 JSON-LD도 원래 없었으므로, 새 rule이 정당하게
  5번째 gated finding으로 잡히는데 테스트는 "정확히 4종"으로 하드코딩돼 있었다(2026-08-19 robots.ts
  fixer 추가 때 겪은 것과 동일 클래스 — 기능 확장이 다른 파일의 하드코딩된 가정을 깨는 패턴이 이번이
  세 번째). 실제 버그가 아니라 의도한 동작 변화라 기대값을 4→5로 갱신하고, layout.tsx에 JSON-LD가
  실제로 같은 PR에 반영됐는지 확인하는 assertion도 새로 추가했다(기존 page.tsx·robots.ts 검증과
  동일한 엄격도).
- typecheck 0에러 · build 0에러 · 전체 스위트 재실행(수정 후): **74개 파일 530개 테스트 전부 통과**
  (기존 516 + 신규 13(단위9+통합4) + 회귀 수정 1건, 넷 실패 0). `npm audit --audit-level=high`: 0건.
- `plugin.json` **0.1.3→0.1.4**(이번에도 실제 도달 가능한 코드 변경) + `claude plugin validate
  --strict` 통과 + `npm run package:plugin` 재생성 완료.

### README.md/README.en.md 정합성 수정(함께 발견·수정)
GSC_PROPERTY_SCOPE 문서 반영을 하려고 README를 열었다가, **README가 이미 사실과 다른 내용을 담고
있었다**는 걸 발견했다(위 항목 3의 "다음 과제"가 예상보다 컸음) — "Google Search Console/Analytics
실연동은 아직 시작 안 함, 인터페이스 골격과 가짜 클라이언트만 있음"이라고 적혀 있었는데, 실제로는
이미 완전히 구현·배선까지 끝난 상태였다(2026-07-15 "AI 크롤러 정책 README 자기모순"과 같은 클래스의
결함 — 기능은 완성됐는데 문서 반영이 누락됨). 환경변수 표의 "SEOMEDIC_GITHUB_TOKEN 외엔 없음" 문구도
마찬가지로 사실이 아니게 됨. 둘 다 README.md·README.en.md 양쪽에서 수정했고, Phase 2 완료 목록에
GSC/GA4/PSI·JSON-LD 생성 항목을 새로 추가했다. **README.html/README.en.html(정적 HTML 미러)은
자동 생성 스크립트가 없어(직접 확인) 이번엔 갱신하지 못했다 — 다음 과제로 명시.**

### CI 관찰 — Windows `github-orchestrator.test.ts` 타임아웃 2회 연속 재발(수정 안 함, 관찰만)
이번 라운드 직전 커밋(GSC/GA4 배선, `4680bec`)의 Windows CI가 또 같은 자리(`github/npm-install.ts:79`
의 `npm install` 5분 타임아웃, `github-orchestrator.test.ts`의 safe/review 분리 테스트)에서 실패했다
— plugin.json 버전업 라운드에 이어 **2번째 재발**. 재실행으로 통과했지만(플레이키 확인), 같은 자리가
두 번 연속 걸린 건 "운이 나빴다"보다 "이 테스트가 2회 연속 실제 npm install(safe+review 각 sandbox
마다 하나씩)을 하는 구조상 Windows CI에서 5분이 종종 빠듯하다"는 신호에 가깝다. 이번 라운드 범위 밖
(내가 만진 코드와 무관)이라 손대지 않았지만, **3번째 발생 시엔 원인으로 보고 타임아웃 상향 등 실제
수정을 권장** — 근거 없이 "완전히 안전하다"고 단정하지 않는다.

---

## ✅ title 자동 채우기 fixer(R-TITLE-MISSING, h1 텍스트 복사·1차 범위) 신규 구현(2026-08-21)

**배경**: 사용자 요청으로 PRD 5문서·CHECKPOINT.md 전체를 처음부터 다시 전수 재대조했다. `03_PHASES.md:70`
(Phase 1.5)이 명시한 gated 목록 `canonical/noindex/robots/sitemap/JSON-LD/title/meta/alt` 7개 중
6개는 이미 구현돼 있었는데, title만 탐지(`rules/definitions/content-structure.ts`)만 있고 실제
fixer가 없었다 — 이 사실 자체는 새로 발견한 게 아니라, CHECKPOINT.md에 이미 두 차례("GSC/GA4 실
client 구현" 라운드, "JSON-LD 생성 fixer" 라운드) "다음 순서로 확정"이라고 명시돼 있었는데 매번
"이번엔 더 쉬운 것부터"로 미뤄진 항목이었다. 이번 라운드에서 그 약속을 실제로 이행했다.

### 왜 alt·meta description은 이번에도 제외했는가(범위 판단)
`04_PROJECT_SPEC.md:92-103`의 safe/gated 경계표를 다시 정확히 읽었다 — title·meta는 그냥 "gated"로만
표시돼 있지만, **alt만 "gated/제안만"으로 별도 표시**돼 있다(alt는 비전 없이 생성 시 이미지 내용
환각 위험이 있어 fixer 자체를 만들지 않는 게 원래 설계 의도라는 뜻 — 지금 코드도 정확히 그렇게 돼
있었다). meta description은 PRD에 아예 탐지 규칙조차 없었다(`rules/definitions/`에 R-META-DESC류가
전무함을 grep으로 확인) — title처럼 "이미 페이지에 있는 값을 그대로 복사"할 단일 필드가 없고, 본문
텍스트 중 어느 부분을 발췌할지 결정하는 문제라 title과는 질적으로 다른 위험(발췌 위치 선정)이 새로
생긴다. 이번 라운드는 title만으로 좁히고, meta description은 README에 "발췌 방식 설계 필요"로 명시해
다음 라운드 과제로 남겼다 — canonical→OG→robots→noindex→JSON-LD로 이어져 온 이 프로젝트의 기존
관례(매 라운드 범위를 의도적으로 좁히고 어려운 부분은 이유와 함께 명시적으로 미룸)를 그대로 따른 것.

### 값 발명 금지 원칙을 이번엔 어디에 적용했는가
canonical/OG/JSON-LD가 전부 "이미 아는 필드 값을 다른 곳에 복사"였다면, 이번엔 "같은 페이지에 이미
존재하는 **다른** 텍스트(h1)를 복사"라는 한 단계 다른 적용이다 — 새 문구를 짓는 게 아니라 사용자가
이미 화면에 써 놓은 실제 글자를 그대로 가져다 쓸 뿐이라는 점에서 원칙은 동일하게 유지된다. h1이 없는
페이지는 복사할 원본이 없으므로 report_only로 폴백한다(fail-closed, 다른 모든 fixer와 동일 원칙).

### 1차 범위를 의도적으로 좁힌 지점(다음 라운드 과제로 명시)
canonical/OG/noindex fixer가 전부 공유하는 `findStaticMetadataObject` 전제(`export const metadata`가
**이미 정적 object literal로 존재**해야 함)를 title fixer도 그대로 재사용했다 — `metadata` export
자체가 파일에 전혀 없는 경우(App Router에서 title이 완전히 없는 페이지라면 오히려 이쪽이 더 흔할 수
있음)는 "새 export 블록을 처음부터 생성"이라는 이 프로젝트가 아직 풀지 않은 더 큰 문제라 이번엔
손대지 않고 report_only로 남겼다. 즉 이번 fixer는 "metadata는 있는데 title만 빠진" 페이지에서만
실제로 동작한다 — README에 이 한계를 명시했다.

### 구현
- `fixers/title-fixer.ts`(신규) — `planTitleFix`/`writeTitleFix`. noindex-fixer.ts의
  `findStaticMetadataObject`/`hasSpreadElement`를 의도적으로 복제(이 저장소 기존 관례). 이미 title이
  존재하면(빈 문자열 포함) `add-safe-guard.ts`의 `assertFieldAbsent`로 감지해 절대 덮어쓰지 않는다.
- `fix-orchestrator/scan.ts` — `ScannedPage`에 `renderedH1Text` 필드 추가(기존 `renderedTitle`·
  `renderedCanonical`과 동일 패턴, `dom-signals.ts`의 `h1Text`는 이미 있었고 threading만 빠져 있었음).
- `fixers/registry.ts` — `R-TITLE-MISSING`을 gated로 등록.
- `fix-orchestrator/plan.ts` — `planTitleFixForFinding`(og-fixer.ts와 동일 패턴, `scanResult.pages`에서
  렌더된 h1 값을 가져와 그대로 복사) + 디스패치 분기.
- `fix-orchestrator/apply.ts` — `applyTitleFix`(applyNoindexFix와 완전히 동일한 스켈레톤 — 기존 파일
  수정이라 백업/build 재검증/실패시 git checkout 롤백).

### 검증(전부 실제 실행)
- typecheck 0에러 · build 0에러.
- 단위 테스트 9개(`title-fixer.test.ts`) — h1 복사·필드 보존·이미 존재(빈 문자열 포함) 멱등·h1 없음
  fail-closed·metadata 부재/동적/스프레드 fail-closed·파일 없음까지 포함.
- 통합 테스트 4개(`fix-orchestrator-title-integration.test.ts`, 실제 `next build` 포함, noindex 테스트와
  동일 패턴) — (a) 미승인 시 무변화 (b) 승인→적용→build 통과→title이 h1 텍스트로 채워짐(다른 필드
  보존·JSX 무변화 확인)→rollback 원복 (c) 거부 시 무변화 (d) 재실행해도 중복 없음(멱등) + R-TITLE-MISSING이
  다음 감사에서 더 이상 발화하지 않음까지 확인.
- `fixer-registry.test.ts`에 회귀가드 1건 추가.
- 기존 `fix-orchestrator-js-only-canonical-integration.test.ts`가 `ScannedPage` 리터럴을 4곳에서 직접
  만들고 있어(신규 필수 필드 추가로 인한 타입 에러) `renderedH1Text: null`을 4곳 전부에 추가.
- **전체 스위트를 총 3회 실행**했다(이례적으로 많이 돈 이유를 정직하게 기록): 1차 545/546(1건 실패,
  `server-integration.test.ts` EPERM+90초 타임아웃) → 그 파일만 단독 재실행하니 통과(51초) → 2차
  전체 재실행 544/546(이번엔 다른 2건 실패 — 내 신규 `fix-orchestrator-title-integration.test.ts`의
  (a)가 git commit 실패, 그리고 무관한 기존 파일 `github-sandbox.test.ts`가 30초 타임아웃) → 그 두
  파일만 단독 재실행하니 9/9 전부 통과(180초) → 3차 전체 재실행 **76개 파일 546개 테스트 전부 통과**
  (완전 그린). 매번 다른 파일이 실패했고 전부 단독 실행 시엔 항상 통과한다는 점, 그리고 실패한 파일들이
  하나같이 실제 git/npm/파일시스템 하위 프로세스를 쓰는 무거운 통합 테스트라는 공통점으로 미뤄, 이번
  세션이 이미 두 차례(`server-integration`류 Windows 임시폴더 EPERM, `github-orchestrator`의 npm
  install 5분 타임아웃) 관찰해 온 것과 **같은 종류**(76개 파일 동시 실행 시 이 Windows 개발 PC의
  자원 경합)로 판단했다 — 내가 만든 코드의 결함이라는 근거는 없었다(신규 테스트도 단독으로는 항상
  통과, 무관한 기존 파일도 함께 실패). 다만 짐작만으로 "안전하다"고 넘기지 않고 3차 실행으로 실제
  완전한 그린을 직접 확인한 뒤 이 사실을 기록한다.
- `npm audit --audit-level=high --workspace=packages/mcp-engine`: 0 vulnerabilities.
- `claude plugin validate packages/plugin --strict` 통과 · `npm run package:plugin` 재생성 완료.
- `plugin.json` **0.1.4→0.1.5**(실제 도달 가능한 코드 변경 — `seomedic_fix_plan`/`seomedic_fix_apply`
  경로에서 title fix가 실제로 계획·적용됨).

### README.md/README.en.md 갱신
기존 "Phase 2 Stage 4" 두 항목(한국어판은 중복 서술 2곳)이 "제목·이미지 설명은... 탐지만 하고
자동으로 고쳐주지는 않습니다"라고 title을 명시적으로 예로 들고 있어, 이번 변경으로 그 문장이 부분적
으로 사실이 아니게 됐다(2026-08-20 GSC/GA4와 같은 클래스의 README 정합성 문제 — 이번엔 손대기 전에
미리 잡음). 기존 항목 본문은 그대로 두고(과거 시점 기록 보존, JSON-LD 라운드와 동일한 방식) 짧은
경고 문구만 추가해 아래 새 항목을 가리키게 했다. "Phase 1.5 — 페이지 제목(title) 자동 채우기" 항목을
새로 추가하고, 1차 범위 제한(metadata 부재 시 미지원)과 meta description 제외 이유를 명시했다.
"앞으로 계획된 것" 줄에 "메타 설명 자동 채우기(발췌 방식 설계 필요)"를 추가했다. README.html/
README.en.html(정적 HTML 미러)은 여전히 자동 생성 도구가 없어 갱신하지 못했다(기존에 이미 명시된
동일한 한계, 이번 라운드에서 새로 생긴 문제 아님).

### 남은 것(정직하게 명시)
1. **metadata export 자체가 없는 페이지는 여전히 제안만** — 위 "1차 범위" 참고. 실사용 커버리지가
   생각보다 낮을 수 있다(title이 완전히 없는 페이지는 metadata export 자체가 없는 경우가 더 흔할
   가능성). 실사용 검증(아래 4)에서 이 fixer가 실제로 몇 번이나 "적용 가능"으로 잡히는지 관찰 필요.
2. **meta description 자동 채우기는 여전히 미착수** — 발췌 위치 선정이라는 새로운 종류의 설계 문제라
   별도 라운드 필요(README에 명시).
3. Windows CI `github-orchestrator.test.ts` npm install 타임아웃은 이번 라운드에서 재발하지 않았다
   (관찰 계속, 누적 2회 그대로 유지).
4. PRD 최우선 성공기준인 "마켓 플러그인 실사용 재검증"은 여전히 미해결 — 이번 라운드도 이 항목을
   진행하지 못했다(사람 전용).

---

## ✅ Windows CI `github-orchestrator.test.ts` 타임아웃 3번째 발생 — 실제 수정(2026-08-20)

바로 위 title fixer 커밋(`bf8fba9`)을 push한 뒤 CI를 지켜보다가, ubuntu·macOS는 통과했지만 **windows
-latest만 `github-orchestrator.test.ts`에서 타임아웃 실패**를 실제로 관찰했다. 다만 이전 2회와 달리
이번엔 다른 지점이었다 — 이전 2회는 `github/npm-install.ts:79`의 `npm install` 300초 타임아웃(safe/
review 두 sandbox 각각 실제 npm install)이었는데, 이번엔 **"policy가 차단하면(archived) sandbox
clone까지 가지 않고 즉시 실패한다"** 테스트가 정확히 30000ms에서 타임아웃됐다(로그로 직접 확인,
추측 아님). 이 테스트는 이름 그대로 실제 네트워크·npm install 없이 로컬 fake client로 즉시 실패해야
하는, 원래 빠른 테스트다.

**원인 판단**: 같은 파일의 두 무거운 스트레스 테스트(각각 실측 614853ms·517717ms)가 먼저 실행된 뒤라
Windows CI 러너 자원이 소진된 상태에서, `makeFakeUpstreamRepo()`의 로컬 git 서브프로세스(init/commit)
조차 원래 여유있던 30초 상한을 넘겨버린 것으로 판단했다 — 이 테스트만 실패하고 나머지 4개(그중 2개는
15분 상한 테스트)는 전부 정상 통과했다는 사실이 "로직 자체가 느려짐"이 아니라 "이 테스트만 유독 짧은
30초 여유"였다는 판단을 뒷받침한다. CHECKPOINT.md가 이전에 이미 "3번째 발생 시엔 실제 수정 권장"으로
못박아 둔 조건에 해당한다고 판단해, 이번엔 관찰만 하지 않고 실제로 고쳤다.

**수정**: `test/unit/github-orchestrator.test.ts:207` — 이 테스트만 `30_000` → `120_000`으로 상향(같은
파일의 다른 무거운 테스트 240_000~900_000과 비교하면 여전히 훨씬 짧게 유지 — 진짜 무한 대기(hang)가
생기면 여전히 2분 안에 잡아낸다). 다른 4개 테스트·다른 파일은 전혀 건드리지 않았다(최소 변경 원칙).

**검증**: 해당 파일만 단독 재실행 — 5/5 전부 통과, 388초(기존 관측치와 동일한 수준, 회귀 없음).
typecheck는 순수 숫자 리터럴+주석 변경이라 영향 없음(별도 재실행 불필요로 판단).

---

## ✅ Windows CI `npm-install.ts:79` 타임아웃 — 진짜 3번째 재발 확인, 실제 수정(2026-08-20)

위 수정(`67462fb`)을 push하고 CI를 계속 지켜봤다 — ubuntu·macOS는 빠르게 통과했지만 **windows-latest는
32분째 여전히 Test 단계**였다(단계별 로그로 직접 확인, 아직 실패는 아니었음). 그대로 10분 더 기다리니
이번엔 **정확히 이전 2회와 같은 자리**(`github/npm-install.ts:79`, "의존성 설치 타임아웃(300000ms)")
에서 실패했다 — 즉 이번 라운드에서 CI가 실제로 서로 다른 타임아웃 문제 **2건**을 연달아 잡아냈다(위
"policy 30초 테스트"는 이미 고쳤고, 이건 별개의 원래부터 알려져 있던 문제).

CHECKPOINT.md에 이미 "2번째 재발(2026-08-20 GSC/GA4 라운드) — 3번째 발생 시엔 실제 수정 권장"이라고
명시돼 있었고, 이번이 정확히 그 3번째다. 더 이상 관찰만 하지 않고 실제로 고쳤다.

**수정**: `src/github/npm-install.ts:7` — `DEFAULT_TIMEOUT_MS`를 `5 * 60_000`(5분) → `8 * 60_000`
(8분)으로 상향. 이 값은 GitHub 저장소 자동수정(`seomedic_fix_github`, 실사용자 경로)의 실제 npm
install에도 그대로 쓰이는 프로덕션 상수라, 테스트 파일이 아니라 소스 자체를 고쳤다 — "느린 실제
저장소를 좀 더 참을성 있게 기다려주는" 방향이라 더 관대해질 뿐 덜 안전해지지 않는다(타임아웃을
늘리는 것은 이 저장소의 보안 원칙과 충돌하지 않는 방향의 변경).

**왜 이 값인가(추측 아님, 근거 명시)**: 이 개발 PC에서는 같은 실제 npm install이 반복 실행 내내
항상 300초에 크게 못 미쳐 끝났다(오늘 세션에서만 `github-orchestrator.test.ts` 단독 3회, 전체
스위트 포함 3회, 전부 정상 완료) — "진짜 멈춤(hang)"이 아니라 "Windows CI 러너의 일시적 자원 경합"
이라는 기존 판단을 뒷받침한다. 8분은 CI에서 실제로 걸린 시간(300초를 넘겨 실패)보다 충분히 여유
있으면서도, 진짜 멈춤이 생기면(예: 네트워크 완전 단절) 여전히 유한 시간 안에 잡아낸다.

**검증(전부 실제 실행)**:
- typecheck 0에러 · build 0에러.
- `github-npm-install.test.ts`(값을 오버라이드하지 않는 기본 경로 테스트 포함) + `github-orchestrator.
  test.ts` 재실행 — 7/7 전부 통과, 323초(회귀 없음, 로컬은 원래도 300초 안에 끝나 이 변경으로 로컬
  동작이 달라지지 않음 — 예상대로).
- `npm audit --audit-level=high --workspace=packages/mcp-engine`: 0 vulnerabilities.
- `claude plugin validate packages/plugin --strict` 통과 · `npm run package:plugin` 재생성 완료.
- `plugin.json` **0.1.5→0.1.6**(`seomedic_fix_github` 경로에서 실제 도달 가능한 코드 변경).
- **커밋(`d721402`) push 후 CI 3-OS 전부 실제로 그린 확인 완료**(ubuntu 8m10s·macOS 10m19s·windows
  27m43s, run `32404334322`) — windows가 이전보다 오래 걸리긴 했지만(늘어난 테스트 수 반영) 이번엔
  타임아웃 없이 정상 완주했다. 같은 라운드 안에서 서로 다른 CI 전용 타임아웃 문제 2건(policy 30초
  테스트, npm-install 300초)을 연달아 실측하고 둘 다 고친 뒤에야 3-OS 그린을 확인한 것까지 정직하게
  기록한다 — "한 번에 안 됐다"를 감추지 않는다.

---

## ✅ title fixer 악의적/경계 입력값 회귀 테스트 추가(2026-08-20)

사용자의 표준 "테스트/검증" 요청에 따라 title fixer를 재검증하며, 지금까지 다루지 않았던 위험(h1
텍스트에 따옴표·백슬래시·백틱·`</script>` 유사 문자열·2000자 긴 텍스트·이모지·줄바꿈이 섞여 있을 때도
안전한가)을 새로 확인했다. `title-fixer.test.ts`에 7개 추가(총 11→18개) — 각 케이스에서 `planTitleFix`
결과를 실제로 다시 ts-morph로 파싱해 title 값이 원본과 정확히 일치하는지 "AST 왕복" 방식으로 기계적
검증(육안 대조 아님). 전부 통과, 값 손상·주입 위험 없음 확인. typecheck 재확인 0에러. 커밋 `8e01975`,
push 완료(CI는 아래 "다음 작업 계획" 절에 상태 기록).

---

## 📋 다음 작업 계획 — 위험 분석 포함 재정리(2026-08-20)

**배경**: 사용자가 "다음 작업 단계를 보류·추측·누락·오류·빈틈·모순·변수·문제 없이 철저히 파악해
CHECKPOINT.md에 기록하라"고 명시적으로 요청했다. 아래는 그 요청에 따라 실제로 코드·CI 로그·git
이력을 직접 열어 확인한 뒤 정리한 것이며, 확인하지 않은 것은 확인했다고 적지 않는다.

### 우선순위 1(최상위, 그러나 AI가 대행 불가) — 마켓플레이스 실사용 재검증

`.PRD/03_PHASES.md:33`가 정의한 Phase 1 성공기준("마켓 플러그인으로 설치 → 다른 프로젝트에서
`/seo-audit` 실행 검증, Win/Mac/Linux")이 **이번 세션까지 포함해 6차례 연속** "여전히 미해결"이다.
**정직하게 기록한다**: 매 세션 "다음 Phase 방향"을 재검토할 때마다 AI가 실행 가능한 새 기능 쪽으로
결론이 반복돼 왔고, 그 결과 PRD 자신이 1순위로 못박은 이 항목은 계속 뒤로 밀렸다. 이건 논리적
모순이 아니라(사람 전용 작업을 AI가 대신할 수 없다는 구조적 제약) — 하지만 "계속 미뤄지고 있다"는
사실 자체를 감추면 안 된다고 판단해 이번에 명시적으로 못박는다. **다음 세션에서 다른 무엇보다
이 항목을 먼저 사용자에게 확인받는 것을 최우선으로 한다.**

### 신규 발견(이번 검증 라운드에서 처음 확인) — 테스트 픽스처의 CI 감사 사각지대

`packages/mcp-engine/test/fixtures/nextjs-minimal/package-lock.json`(git에 커밋됨, fixer 통합테스트
10개가 공유)에 **고위험 CVE 4건**이 걸려 있다(`npm audit` 직접 실행으로 확인 — 추측 아님):
- `next`(9.3.4-canary.0~16.3.0-preview.10 범위): Server Actions SSRF·캐시 응답 혼동·Middleware 우회 등
  9건의 GHSA
- `nanoid`(≤3.3.17): 비보안 생성기 무한루프(DoS)
- `postcss`(≤8.5.22): sourceMappingURL 경유 임의 파일 읽기·XSS
- `sharp`(<0.35.0): libvips 상속 취약점(CVE-2026-33327 등 4건)

**왜 지금까지 CI가 못 잡았나(추측 아님, 워크플로 파일로 확인)**: `.github/workflows`의 "Audit (high
severity)" 단계는 루트 `npm run audit`(`npm audit --audit-level=high`)만 실행하는데, 이 픽스처는
`pretest` 단계에서 `npm ci --prefix test/fixtures/nextjs-minimal`로 **독립 설치**되는 별도 패키지라
루트 audit 범위 밖이다. PRD M9("CI에서 고위험 취약점 발견 시 빌드 실패")가 문자 그대로는 통과하지만,
실제로는 이 픽스처가 감사망 밖에 있다는 뜻 — **감사 자체의 사각지대**다.

**실제 위험도 평가(과장도 축소도 하지 않음)**: 배포되는 코드가 아니라 CI 안에서만 실행되므로 낮음.
다만 (1) 공개 저장소에 그대로 노출돼 있고, (2) 이 취약점 중 일부(Server Actions SSRF)는 fixer
통합테스트가 `next build && next start`로 실제 로컬 서버를 띄우는 그 순간에 **실제로 실행되는
코드**이며, (3) 이 프로젝트가 SSRF(M1)를 가장 무겁게 다뤄온 것과 정확히 같은 클래스의 문제가 테스트
인프라 자체에 있다는 점에서 무시하기엔 찜찜하다.

### AI 실행 가능한 다음 코드 작업 후보 2개 — 각각의 위험/변수까지 포함

| 후보 | 내용 | 예상 위험·변수 |
|---|---|---|
| **A. 픽스처 취약점 수정** | `next@16.3.1`로 상향(semver 범위 밖 — `--force` 필요) | **충돌 위험**: major 버전 점프라 App Router 메타데이터 렌더링 방식·Turbopack 기본 동작이 바뀌면 `dom-signals.ts`의 셀렉터 가정이나 fixer들의 AST 편집 전제가 깨질 수 있음. **완화책**: 업그레이드 후 typecheck+build+**fixer 통합테스트 10개 전부**+전체 스위트 재실행 필수, 하나라도 깨지면 안전하게 롤백하고 "지금은 못 올림"으로 정직히 기록(억지로 맞추지 않음). |
| **B-1. title fixer 범위 확장** | `metadata` export 자체가 없는 페이지까지 지원(현재는 "이미 있는데 title만 빠진" 경우만) | **새로운 위험군**: canonical/OG/noindex/JSON-LD 전부 "기존 객체에 속성 추가"만 했는데, 이번엔 "새 export 문 자체를 처음부터 삽입"이라는 이 프로젝트가 아직 안 해본 조작. `'use client'` 페이지에 잘못 삽입하면 빌드 실패(안전망은 있으나 report_only 폴백이 많아질 수 있어 실효성이 기대보다 낮을 위험). |
| **B-2. meta description 자동 채우기** | PRD Phase 1.5/2가 지정한 gated 목록 중 마지막 남은 항목 | **선행 필요**: "본문 어디를 발췌할지" 자체가 아직 사용자와 합의되지 않은 설계 문제. 합의 없이 착수하면 nav/footer 텍스트가 섞여 들어간 무의미한 description을 만들 위험(값 발명 금지 원칙에 정면으로 걸림) — **착수 전 사용자 확인이 다른 두 후보와 달리 반드시 선행돼야 함**. |

### 권장 순서

**A(픽스처 취약점 수정) → B-1 또는 B-2(사용자 선택)**. A를 앞에 둔 근거: 새 기능보다 "이미 실재하는
문제를 닫는 것"이 이 프로젝트의 반복된 원칙(README 정합성 수정·타임아웃 실제 수정 등 이번 세션에서만
벌써 3차례 같은 패턴)과 일치하고, 작업 범위가 기계적(버전 상향+전면 재검증)이라 실패해도 롤백이
분명하다. B-1/B-2는 각자 진짜 새로운 위험(신규 AST 조작 / 미합의 설계 문제)을 안고 있어 A보다 더
신중한 착수가 필요하다.

### 이번 라운드 CI 상태(정직하게 명시 — 확인 안 된 것을 확인했다고 하지 않음)

`8e01975`(악의적 입력값 테스트 추가) 커밋의 CI: 이 문서를 작성하는 시점 기준 **ubuntu·macOS 통과,
windows는 아직 진행 중**(20분+ 경과, 통상 27~30분 소요 — 과거 실측 근거). 완료 여부는 다음 확인
시점에 갱신 필요.

### 남은 것(정직하게 명시)
1. 위 "우선순위 1"(실사용 재검증)은 6번째 세션째 미해결 — 다음 세션 시작 시 최우선 확인 대상.
2. 픽스처 취약점 수정 여부는 아직 착수 전(이 문서 작성 시점 기준 코드 변경 없음).
3. B-1/B-2 중 어느 것을 먼저 할지는 사용자 결정 대기.
4. `8e01975`의 windows CI 결과: **완료, 3-OS 전부 통과 확인**(macOS 10m1s·ubuntu 6m31s·windows 29m3s, run `32408656560`) — 위 "미확인" 상태 해소.

---

## ✅ README.md/README.en.md/README.html/README.en.html 전면 재검증·정합화(2026-08-21)

**배경**: 사용자가 "지금까지 개발한 기준으로" 왕초보용 README를 한/영 md+html 4개 파일 모두 최상위
경로에, md와 html 내용이 동일하게, 모순·누락·오류 없이 작성해 달라고 요청했다. 기존 README.md/
README.en.md는 이미 15개 섹션(목차~법률)을 갖춘 완성된 구조였으나(2026-08-04 GUIDE 통합 이후 계속
누적 갱신), 실제로 열어 대조한 결과 세 종류의 실제 결함을 발견해 전부 수정했다 — 추측이 아니라
전부 코드/파일을 직접 열어 확인한 것만 기록한다.

### 발견 1 — 이미 해결된 이슈를 "미해결"로 계속 안내하던 문서 오류
`README.md`·`README.en.md` 둘 다 "2026-08-10 기준 알려진 문제"(플러그인 로드 실패, EINVAL)를 여전히
"수정 완료했으나 아직 master에 병합 전"이라고 안내하고 있었다. 실제로는 이 문제(2026-08-19 EINVAL
수정 포함)가 이미 여러 라운드 전에 master에 병합·배포됐다(현재 plugin.json이 0.1.1이 아니라 0.1.6인
것으로 직접 확인). 사용자에게 이미 없는 문제를 "겪을 수 있다"고 계속 경고하는 건 명백한 오류라 판단해
제거하고 "이미 해결·병합됨"으로 정정했다. 같은 이유로 "8번 업데이트 요약"의 해당 토글 항목 제목도
"병합 대기" → "병합 완료"로 정정했다.

### 발견 2 — CommonMark 렌더링이 실제로 깨지는 문장 4곳(GitHub에서도 동일하게 깨졌을 가능성)
README.md를 pandoc으로 HTML 변환하는 과정에서, `**[FAQ.md](./FAQ.md)**를`처럼 **닫는 `**` 바로 뒤에
공백 없이 한글 조사가 붙는 경우, CommonMark 스펙(닫는 delimiter가 구두점 뒤에 오면 그 뒤도 공백/구두점
이어야 유효) 때문에 굵게 처리가 적용되지 않고 `**` 문자가 그대로 노출되는 실제 렌더링 결함을 발견했다.
`)**[한글조사]` 패턴으로 전체 저장소를 grep해 정확히 4곳을 찾아 전부 수정했다(닫는 `**` 뒤에 "문서를"
"형태로" 같은 자연스러운 단어를 추가해 공백을 확보). **이 버그는 HTML 변환 과정에서 우연히 발견한
것이지만, GitHub 자체의 마크다운 렌더러(cmark-gfm 기반)도 같은 CommonMark 규칙을 따르므로 지금까지
GitHub에서 이 문서를 볼 때도 실제로 똑같이 깨져 보였을 가능성이 높다** — HTML 전용 문제가 아니라
원본 md 자체의 결함이었다고 판단해 md 원본에서 직접 고쳤다.

### 발견 3 — 한/영 README의 "업데이트 내용 요약" 항목 수 불일치(16 vs 14)
`<details>` 개수를 세어보니 한국어판만 16개, 영문판은 14개였다. 대조한 결과 한국어판에만 있는 2개
("Phase 2 Stage 4 — 콘텐츠 기본 요소... 탐지", "Phase 2 Stage 5 — 상품 구조화 데이터... 탐지")는
전부 **같은 섹션 안에 뒤이어 나오는, 내용을 포함하고 갱신한 더 완전한 항목**(Core Web Vitals 3종
완결이 추가된 버전, Q&A+Product 검증이 재서술된 버전)과 실질적으로 중복이었다 — 영문판은 애초에 이
중복이 없었다(더 정확한 상태). 영문에 맞춰 중복을 새로 추가하는 대신, **정보 손실 없이 한국어판의
오래된 중복 2개를 제거**해 16→14로 맞췄다(제거 전 두 쌍의 본문을 직접 대조해 완전히 상위 호환됨을
확인한 뒤 삭제 — 임의 삭제 아님).

### HTML 미러 생성 방식(자동 생성 도구 부재 — 이번에 실질적으로 해결)
`README.html`/`README.en.html`은 과거부터 존재했으나 커밋 `d4ec918`(수개월 전) 이후 한 번도 갱신되지
않아 GSC/GA4·JSON-LD 생성·title fixer 등 최근 기능이 전부 빠진 상태였다(직접 확인 — 오래된 스타일은
그대로, 내용만 심각하게 낡음). 이번엔 `pandoc -f gfm -t html`(로컬 설치 확인됨, v3.7.0.2)로 최신
README.md/README.en.md를 변환해 기존 HTML의 손으로 짠 `<head>`/CSS 템플릿에 그대로 이식했다 — 수작업
전사(轉寫) 대신 프로그램적 변환을 택한 이유는 "md와 html 내용이 동일해야 한다"는 요구를 사람이 옮겨
적는 방식으로는 오탈자·누락 위험 없이 보장할 수 없기 때문이다. 문서 간 링크(`README.en.md`·
`TROUBLESHOOTING.md`·`FAQ.md`)는 HTML 안에서는 실제로 존재하는 `.html` 미러로 향하도록 sed로
일괄 치환했다(대상 파일 4개 전부 실제 존재 확인 완료 — 깨진 링크 없음). `lang="ko"`로 잘못 박혀
있던 `README.en.html`의 `<html lang>`도 `lang="en"`으로 수정했다(기존 버그).

### 검증(전부 실제 실행, 추측 없음)
- `<h2>`(html) vs `## `(md) 섹션 개수: 4개 파일 전부 16개로 일치.
- `<details>` 토글 개수: 4개 파일 전부 14개로 일치(한/영 동수).
- "553"(현재 테스트 개수) 언급: 4개 파일 전부 정확히 1회.
- `)**[한글조사]` 깨짐 패턴, `.md")` 형태의 남은 문서간 링크: 재검색 결과 4개 파일 전부 0건.
- README가 참조하는 모든 파일(CHECKPOINT*.md·LICENSE·THIRD_PARTY_NOTICES.md·TROUBLESHOOTING*.md·
  FAQ*.md·HUMAN_ACTION_CHECKLIST.md·SECURITY.md·DISCLAIMER.md 등 13개) 실제 존재 확인.
- 마켓플레이스 이름(`sodam-seomedic-marketplace`)·GitHub 저장소 주소(`sodam-ai/SoDam-SeoMedic`)를
  각각 `.claude-plugin/marketplace.json`·`git remote -v`로 직접 대조해 README 안내와 정확히 일치함을
  확인(추측 아님).
- 실제 슬래시 명령어 파일(`packages/plugin/commands/*.md`) 3개(`seo-audit`·`seo-check`·`seo-fix`)와
  README "6. 명령어 레퍼런스" 표가 정확히 일치함을 확인.

### 남은 것(정직하게 명시)
1. `TROUBLESHOOTING.md`/`FAQ.md`와 그 `.html` 미러 자체의 최신성은 이번 라운드에서 검증하지 않았다
   (이번 작업 범위는 README 4파일로 한정 — README가 이 문서들을 향해 정확한 링크를 갖고 있다는 것만
   확인했고, 그 문서들 자신의 내용 정확성은 별도 확인 필요).
2. HTML 변환은 수작업이 아니라 pandoc 자동화로 처리했지만, 이 변환 절차 자체를 재사용 가능한
   스크립트(`scripts/generate-readme-html.mjs` 등)로 저장소에 남기지는 않았다 — 다음에 README.md가
   또 바뀌면 이번과 동일한 수작업 파이프라인(pandoc + sed + cat)을 다시 밟아야 한다. 자동화 스크립트로
   승격하는 건 다음 과제로 남긴다.

---

## 🔚 세션 종료 핸드오프(2026-08-21) — 다음 세션이 여기서부터 이어받을 것

### 지금 이 순간의 정확한 상태(전부 직접 확인, 추측 없음)
- 로컬 `master` = `origin/master`, 최신 커밋 `fb19c9c`, working tree **clean**(단 이 CHECKPOINT.md
  편집 자체는 사용자 지시로 이번엔 커밋하지 않고 로컬에만 남겨둔다 — 아래 "이번 라운드 특이사항" 참고).
- GitHub 저장소 `sodam-ai/SoDam-SeoMedic`: **PUBLIC 유지**(2026-08-21 사용자 재확인·명시 승인).
  About 설명은 최신 기능(GSC/GA4/PSI·noindex/robots/JSON-LD/제목 자동수정) 기준으로 갱신 완료.
  Topics 9개(claude-code·mcp·nextjs·playwright·seo·seo-tools·sqlite·typescript·geo)는 전부 정확해
  변경 없이 유지.
- GUIDE.md/GUIDE.en.md(+html) 4종: **이미 2026-08-04에 로컬·GitHub 양쪽 완전 삭제된 상태였음**
  (git 이력·원격 트리 직접 대조로 재확인). 이번 세션에서 새로 지운 파일 없음.

### 다음 세션이 반드시 먼저 할 일 (순서대로) — ⚠️ 아래는 2026-08-21 시점 기록, 2026-08-31 세션에서
### 1번은 사용자 확인 완료(실사용 재검증 진행 중)·2번(픽스처 취약점 A)은 이번 라운드에 완료됨.
### 상세는 이 문단 뒤에 이어지는 "✅ 테스트 픽스처 npm audit 고위험 4건 해결" 섹션 참고.
1. **`실사용 재검증` 진행 의사를 사용자에게 먼저 확인한다** — PRD `03_PHASES.md:33` 성공기준이
   7세션 연속 미해결. 다른 작업보다 우선해서 이 항목부터 짚을 것(코드 작업이 아니라 "확인 여부를
   묻는 것"이 첫 행동이어야 함).
2. 코드 작업을 진행하게 되면, **바로 위 "✅ README.md/... 정합화" 섹션 이전에 기록된 "📋 다음 작업
   계획 — 위험 분석 포함 재정리(2026-08-20)" 섹션**을 그대로 읽고 시작할 것(후보 3개 + 위험분석 이미
   완료돼 있음, 재분석 불필요).
3. **코드 변경이 생기면 master에 직접 commit/push 하지 말고 새 브랜치를 만들어 그 브랜치에만 push할
   것.** PR 생성·머지·릴리스는 자동 진행하지 않는다(2026-08-21 사용자 명시 지시 — 이번 세션까지의
   커밋들은 이 규칙 도입 이전이라 전부 master 직접 push였음, 그건 문제 없으나 **이 시점 이후부터
   전환**해야 함).
4. **PUBLIC 저장소에 commit/push하기 전에는 매번 visibility를 다시 확인**하고, (a) 비공개 전환 의사
   (b) 이번 작업만 반영해도 되는지를 다시 물을 것 — "저번에 공개 유지한다고 했으니 됐다"고 넘기지
   않는다(2026-08-21 사용자 명시 지시, 매 세션·매 작업 단위 재확인 대상).

### 이번 라운드 특이사항(정직하게 명시)
사용자가 "GUIDE 파일 제거 + commit/push" 작업을 요청했으나, 실제로 확인해보니 (a) GUIDE 파일은 이미
전부 삭제돼 있었고 (b) 작업트리는 이미 완전히 깨끗해 새로 커밋할 변경사항 자체가 없었다 — 그래서
이번 라운드는 "검증만 하고 실제 git 액션은 없음"으로 끝났다. 사용자가 별도로 "CHECKPOINT.md는
commit/push 하지 말라"고 명시했으므로, 이 세션 종료 핸드오프 기록(지금 이 섹션)은 **로컬 파일에만
반영하고 git에는 올리지 않는다** — 다음 세션 시작 시 이 파일을 열어보면 최신 상태를 볼 수 있지만,
GitHub 원격에는 이 핸드오프 기록이 없다는 점을 인지할 것(원격의 CHECKPOINT.md는 `fb19c9c` 시점에서
멈춰 있음). 관련 상세는 `~/.claude/projects/*/memory/seo-seomedic-phase1.5-handoff.md`에도 동일 취지로
갱신해 뒀다(세션 간 자동 상기용).

---

## ✅ 테스트 픽스처 npm audit 고위험 4건 해결 — Candidate A 완료(2026-08-31)

**배경**: 2026-08-20 "다음 작업 계획" 섹션이 정리한 후보 A(픽스처 취약점 수정)를 이번 라운드에서
실행했다. 착수 전 PRD 5문서를 코드와 직접 대조하는 재검증을 거쳤고(안전/gated 경계·크롤 상수
200p/depth3/1req·s·라이선스·SECURITY/DISCLAIMER 위치 전부 실측 일치, 새로 발견한 건 `github_pr` 테이블이
02_DATA_MODEL.md에 미기재됐다는 문서 공백 1건뿐 — 기능 영향 없음, 별도 후속 과제로 남김), 실사용
재검증(PRD 최우선 항목)은 사용자가 별도로 직접 진행 중이라 이 작업과 서로 독립적이라 병행했다.

### 착수 전 재평가로 위험을 낮춘 지점(2026-08-20 원안과 달라진 부분)
원안(2026-08-20 CHECKPOINT 기록)은 "next 16.3.1로 상향, semver 범위 밖이라 `--force` 필요, App Router
메타데이터·Turbopack 기본동작이 바뀌면 깨질 위험"을 유일한 경로로 가정했다. 실제 착수 전 `npm audit
--json`을 직접 파싱해보니 **next 자체의 CVE 범위는 `<16.2.11`뿐**이었다 — 즉 16.2.10→16.2.11(같은
16.2.x 패치 라인)로도 next 자체 취약점은 해소된다는 뜻이라, 원안보다 훨씬 안전한 경로가 있는지 먼저
확인했다.

### 실제로 진행한 것
1. **1차 시도**: `next` 16.2.10→16.2.12(같은 16.2.x 안의 최신 패치)로만 올려봄 — `npm install`,
   재감사 결과 next 자체 CVE는 사라졌으나 **postcss·sharp가 여전히 고위험으로 남음**을 확인.
2. **원인 확인**: `npm ls postcss sharp`로 직접 대조 — 이 둘은 픽스처의 직접 의존성이 아니라 **next
   패키지 자신이 선언한 하위 의존성**(`next@16.2.12 → postcss@8.4.31`, `→ sharp@0.34.5`)이었다.
   즉 `overrides`로 개별 강제하면 next 내부가 기대하는 조합을 깨뜨릴 위험이 더 크다고 판단해(예:
   next의 이미지 최적화 코드가 특정 sharp API를 전제할 수 있음), 원안이 맞았음을 확인하고
   16.3.x로 상향하는 경로로 전환했다.
3. **최종 조치**: `next` 16.2.10 → **16.3.3**(현재 최신 안정판, 16.4.0은 canary만 존재해 제외)로
   `packages/mcp-engine/test/fixtures/nextjs-minimal/package.json`을 수정 후 `npm install`
   (`--force` 불필요 — package.json 자체를 고쳤으므로 정상 설치).

### 검증(전부 실제 실행, 추측 없음)
- **`npm audit --audit-level=high`(픽스처)**: 4건(next/nanoid/postcss/sharp) → **0 vulnerabilities**.
- **`npm audit --audit-level=high`(루트)**: 변경 없음, 그대로 0건(이 픽스처는 원래도 루트 감사 범위
  밖이었으므로 영향 없는 게 정상).
- **typecheck**(`tsc -p tsconfig.test.json`): 0에러.
- **build**(`tsc -p tsconfig.json`): 0에러.
- **fixer 통합테스트 8개 전부**(가장 위험한 구간 — 실제 `next build`를 호출해 canonical·noindex·
  robots-ai-policy·og·jsonld-website·title·js-only-canonical·일반 fix-orchestrator 통합): **30/30
  전부 통과**(244초). App Router 메타데이터 렌더링·Turbopack 기본동작 변경으로 인한 회귀 0건.
- **전체 스위트 1차 실행**: 552/553(1건 실패) — `detect-nextjs.test.ts`가 픽스처의 next 버전을
  문자열로 하드코딩(`"16.2.10"`)하고 있어 발생한 것으로, **실제 결함이 아니라 이 저장소가 반복
  관찰해온 "기능 변경이 다른 파일의 하드코딩된 가정을 깨는" 패턴**과 동일 클래스. 해당 줄을
  `"16.3.3"`으로 갱신 후 단독 재실행 8/8 통과. 저장소 전체를 `16.2.10` 문자열로 grep해 다른 잔재가
  없음도 확인(0건).
- **전체 스위트 2차 실행**(수정 반영 후): **76개 파일 553개 테스트 전부 통과**(완전 그린, 503초).
- **전체 스위트 3차 실행**(같은 커밋 상태, 무변경 재확인차 재실행): `github-orchestrator.test.ts` 5건이
  `.seomedic-github-cache` 디렉터리에서 **Windows EPERM(파일 잠금)**으로 실패 — 이 파일만 단독
  재실행하니 **5/5 즉시 통과**(382초). 직전 2차 실행이 완전 그린이었던 것과 대조하면, 같은 코드
  상태에서 결과가 갈린 것 자체가 "내 변경의 회귀"가 아니라 "무거운 병렬 실행 시의 Windows 자원
  경합"이라는 판단의 직접 증거다 — 이 저장소가 이미 여러 차례(`server-integration.test.ts` EPERM,
  `github-sandbox.test.ts` 타임아웃 등) 관찰해온 것과 정확히 같은 클래스이며, `github-orchestrator.
  test.ts`는 GitHub PR 캐시 로직이라 이번 next.js 버전 변경과 아무 관련이 없는 영역이라는 점도
  회귀가 아니라는 판단을 뒷받침한다.

### 함께 갱신된 것
- `next-env.d.ts`(Next.js 자동 생성 파일, "편집 금지" 주석 있음) — `next build` 실행 중 자동으로
  `root-params.d.ts` 타입 참조 줄이 추가됨(16.3.x의 신규 codegen 산출물, 수동 편집 아님).
- `package-lock.json`(픽스처) — `npm install`로 정상 재생성.

### 남은 것(정직하게 명시)
1. **아직 `git push` 안 함** — 이 저장소는 PUBLIC이고, commit/push 전 매번 visibility 재확인 +
   이번 작업만 반영해도 되는지 확인이 서 있는 규칙(2026-08-21 확정)이라, 로컬 커밋까지만 하고
   사용자 확인 후 브랜치(`fix/fixture-audit-high-severity`, master 아님)에 push한다.
2. `02_DATA_MODEL.md`에 `github_pr` 테이블 미기재 — 이번 라운드 재대조 중 발견한 문서 공백(기능
   영향 없음), 아직 미수정. 낮은 우선순위 후속 과제로 남긴다.
3. B-1(title fixer 무-metadata 케이스 확장)·B-2(meta description 자동채우기)는 여전히 미착수 —
   각각 새로운 위험군·미합의 설계 문제라 사용자 판단 선행 필요(2026-08-20 위험분석 그대로 유효).
4. PRD 최우선 성공기준(실사용 재검증)은 사용자가 별도 세션에서 진행 중 — 결과는 이 라운드 범위 밖.
