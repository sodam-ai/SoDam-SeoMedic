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
- [x] `README.md`(13개 목차 전부), `README.en.md`, `GUIDE.md`(왕초보 단계별+용어집), `TROUBLESHOOTING.md`(16종 매트릭스), `FAQ.md`
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
