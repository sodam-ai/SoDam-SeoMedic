# SeoMedic Phase 1.5(수정기) — 마일스톤 체크포인트

> 근거: Plan Mode 설계(승인됨, `C:\Users\PC\AppData\Roaming\claude-code\plans\cheeky-whistling-yao.md`).
> Phase 1(M0~M9)은 `CHECKPOINT.md`에서 별도 추적, 커밋 `8bcaf8e`로 완료·보존됨.
> 1.5a(로컬 폴더 fix) 먼저 완결 후 1.5b(GitHub PR 모드) 착수.

## 1.5a-1: git-safety 모듈 — done
- `git-safety/git-guard.ts`: `checkGitClean`(argv배열 spawn, `-- .`로 대상폴더만 스코프), `backupFiles`(대상파일만, sha256 매니페스트), `revertViaGitCheckout`
- 검증: 실제 git repo(init+commit)로 clean/dirty/not_a_repo/추적안된새파일 케이스 + **PATH 실제 제거로 git_not_found 재현** + 실제 checkout 롤백. 8/8 테스트.
- 발견: Windows core.autocrlf가 checkout 시 줄바꿈을 정규화함(테스트 assertion 정규화로 수정, 코드 결함 아님).

## 1.5a-2: render-bridge 모듈(SSRF 분리 경로) — done
- `local-loopback.ts`(assertLocalBridgeUrl — 일반 SSRF가드 미사용, 127.0.0.1 리터럴+origin 완전일치만 통과)
- `server-launcher.ts`(launchLocalNextServer — next 바이너리 직접 spawn, `npm run build` 미경유, tree-kill로 프로세스 트리 종료)
- `local-fetch.ts`(fetchLocalBridgeHtml)
- **실제 Next.js 테스트 픽스처 신설**(`test/fixtures/nextjs-minimal/`, 실제 next@16.2.10 설치) — build→start→헬스체크→raw HTML 획득까지 실제 실행 검증(7.74초, 목업 아님).
- 12/12 테스트(local-loopback 7·local-fetch 3·server-launcher 2).

## 1.5a-3: finding_key 안정화 — done
- `logical-url.ts`(toLogicalPageUrl — 임시 포트를 고정 placeholder 호스트로 치환, 해싱 전용)
- 검증: 서로 다른 랜덤 포트 2개로 같은 경로 넣어도 finding_key가 동일함을 실제로 증명. 5/5 테스트.

## 1.5a-4: next-detect 모듈 — done
- `detect-nextjs.ts`(JSON.parse만 사용, require() 금지 — package.json 선언 확인 + node_modules 실치버전 확인 + App/Pages 라우터 감지)
- 검증: **실제 픽스처 프로젝트로 next@16.2.10·app router 정확 감지** 확인 + 6개 오탐방지 negative case. 8/8 테스트.

## 1.5a-5: add-safe-guard + fixers registry — done
- `fixers/add-safe-guard.ts`(assertFieldAbsent/assertArrayEntryAbsent — ts-morph AST 기반, 정규식 금지)
- `fixers/sitemap-fixer.ts`(정적 배열 리터럴 sitemap.ts 전용, 동적 계산 발견 시 report_only 폴백)
- `fixers/registry.ts`(rule_id 유일성 검증, rules/registry.ts 패턴 미러링)
- **설계 중 발견한 중요 이슈**: sitemap 완전성 검사("크롤된 페이지 vs sitemap 목록 비교")는 본질적으로 **사이트 전체** 단위 판정인데, Phase 1의 `rules/registry.ts`·`evaluateAllRules`는 **페이지 단위**(`RuleContext.pageUrl` 하나)로만 평가하도록 설계돼 있어 이 모델에 안 맞음. 억지로 rules 엔진에 끼워맞추지 않고, **Phase 1.5 fix 오케스트레이터가 크롤 결과+`crawler/sitemap.ts`의 기존 `fetchSitemapUrls()`를 직접 비교해 Finding을 직접 생성**하기로 결정(Phase 1의 rules/registry.ts는 무수정 — 최소 침습 원칙 유지). `fixers/registry.ts` 주석에 명시.
- 검증: 정적 배열(추가 성공·멱등성·재실행 안전) + 동적 계산(파일 미변경 확인) + 파일없음 케이스. 12/12 테스트(sitemap-fixer 7·add-safe-guard 5).

## 1.5a-6: DB 마이그레이션 0002_fix + fix 리포지토리 — done
- `db/migrations/0002_fix.ts`(신규 `fix` 테이블, 02_DATA_MODEL.md 필드 그대로 + 감사용 `backup_path` 부가 컬럼) — `0001_init.ts` 무수정, `connection.ts`에 `db.exec(MIGRATION_0002_FIX)` 한 줄만 추가.
- `db/repositories/fix.ts`(`finding.ts` 패턴 미러링): `insertFix`/`findFixById`/`findFixesByFinding`/`findPendingFixes`
- **승인 상태머신 이중 방어**(PRD "안전이 불변식" 반영):
  - `setApprovalStatus`: `WHERE approval_status='pending'` 가드 — 이미 처리된 fix 재승인/재거부 차단(`changed:boolean`으로 호출부에 알림).
  - `markApplied`: `WHERE approval_status IN ('auto','approved')` 가드 — 오케스트레이터가 조회를 잘못해도 이 UPDATE 자체가 미승인 fix의 적용 기록을 막음(2중 게이트).
- 검증: 실제 SQLite 파일로 8개 테스트 — auto/pending 생성, 상태 전이 성공/차단, **미승인(pending·rejected) 상태에서 markApplied 시도 시 changed=false + applied_at 그대로 null** 실행 검증, CHECK 제약(fix_type 잘못된 값) 실제 거부 확인.
- `npm run build`(tsc -p tsconfig.json) + `npm run typecheck`(tsconfig.test.json) 둘 다 0 에러.

## 1.5a-7: fix 오케스트레이터 + MCP 툴 5개 — done (1.5a-8 실통합검증 겸함)

**구현 전 코드 재확인으로 발견한 SSRF/렌더브릿지 충돌 지점 4곳** (계획서엔 개념만 있었고, 실제 구현 착수
시 코드를 다시 읽어 정확한 위치를 확인함 — 전부 "가드에 예외를 뚫지 않고 완전히 별도 경로 신설" 원칙으로 해결):
1. `crawler/crawler.ts`의 `crawl()` → 내부적으로 `safeFetch`(127.0.0.1 차단) 사용 → **재사용 불가**로 확인.
   해결: `render-bridge/crawl-local-bridge.ts` 신설(`CrawlFrontier`+`fetchLocalBridgeHtml` 재사용, `crawler.ts`엔 `extractSameOriginLinks`를 export만 추가).
2. `render/browser-pool.ts`의 `renderAndExtractSignals()` → 최상단에서 `assertSafeUrl(targetUrl)` 호출 → 렌더 진입점 자체가 127.0.0.1을 차단.
   해결: `render-bridge/render-local-bridge.ts` 신설(`assertLocalBridgeUrl` 사용) + `browser-pool.ts`엔 `installSsrfGuardedRouting`에 `allowedOrigins` 옵션 파라미터만 추가(기본값 유지, 기존 호출부 영향 없음) — 서브리소스(`/_next/static/*.js`)가 이 옵션 없이는 여전히 차단됨.
3. `crawler/sitemap.ts`의 `fetchSitemapUrls()` → 내부적으로 `safeFetch` 사용 → sitemap.xml도 로컬 브릿지에서 못 읽음.
   해결: `fetchSitemapUrls`에 `fetcher` 옵션 파라미터 추가(기본값=기존 safeFetch 기반 — 100% 하위호환), fix 오케스트레이터만 `fetchLocalBridgeHtml` 기반 fetcher를 넘김.
4. `render-bridge/server-launcher.ts`의 `launchLocalNextServer()` → 항상 포트확보+start+헬스체크까지 함 → apply 단계의 "빌드만 재검증"엔 과함(불필요한 실패지점 추가).
   해결: 같은 파일에 `runNextBuildOnly()` 신설(내부 헬퍼 재사용, 서버 기동 없이 build만).

**신규 모듈**
- `fixers/sitemap-finding.ts`: `findMissingSitemapPaths` — 크롤된 로컬 URL(127.0.0.1:포트) vs sitemap의 실제 배포 도메인을 **경로(pathname) 기준**으로 비교(호스트가 다르므로 전체 URL 비교 불가 — 설계 중 발견). sitemap이 완전히 비어 있으면 origin을 추측하지 않고 report_only로 폴백(fail-closed).
- `fix-orchestrator/scan.ts`: 로컬 브릿지 크롤+렌더+`evaluateAllRules` 재사용(CWV/Lighthouse는 의도적으로 미측정 — 현재 유일한 fixer가 CWV와 무관해 과잉구현 방지) + sitemap 비교.
- `fix-orchestrator/plan.ts`: git-clean 확인 → Next.js 감지 → 서버 기동 → scan → Finding 저장(**sitemap 누락은 URL별이 아니라 프로젝트당 1개 Finding+1개 Fix로 통합** — URL별로 나누면 같은 파일에 대한 여러 Fix가 서로의 diff를 덮어쓰는 문제가 생김을 설계 중 발견, 그래서 통합) → fixer 매칭 → dry-run Fix 생성.
- `fix-orchestrator/apply.ts`: auto/승인된 fix만 순차 적용 — TOCTOU 재검증(멱등성 포함) → 백업 → 쓰기 → `runNextBuildOnly` → 실패 시 해당 파일만 즉시 git checkout 롤백.
- `fix-orchestrator/rollback.ts`: 적용된 fix를 apply 시점 백업으로 복원(git checkout이 아니라 백업 파일 사용 — apply 이후 시간이 지나 git-clean 전제가 더 이상 보장 안 되므로).
- MCP 툴 5개(`seomedic_fix_plan/approve/reject/apply/rollback`) — `server.ts`에 등록. fix 툴은 **projectRoot 생략 불허**(analyze 툴과 달리 실제로 파일을 쓰므로).
- `packages/plugin/commands/seo-fix.md`: 스텁 → 실제 안내로 교체(승인 없이 gated 적용 금지 등 안전원칙 명시).

**실제 실행으로 발견·수정한 버그 2건** (설계 검토만으론 못 잡았고, 실제 Next.js 빌드를 돌려서만 드러남):
1. **Next.js 16 Turbopack이 cross-drive symlink를 거부**: 테스트 픽스처의 `node_modules`를 junction으로 재사용하려 했으나 "Symlink ... points out of the filesystem root" 실패(임시폴더 C: vs 픽스처 D: 드라이브가 달라서) → node_modules까지 통째로 복사하는 방식으로 전환.
2. **`next build`가 `package.json`/`package-lock.json`을 자체적으로 정규화해 씀**: plan 단계의 빌드가 이 파일들을 건드려 git을 dirty로 만들고, 뒤이은 apply의 git-clean 재확인이 "우리 자신의 빌드 부산물" 때문에 거부되는 실제 버그 발생 → plan이 빌드 직후 git 상태를 재확인해 dirty면 자동으로 `git checkout -- .`로 원복(사용자 작업이 아니라 우리 빌드 부산물임이 확실하므로 안전).
3. **apply의 git-clean 재확인 순서 버그**: 적용할 fix가 0건이어도 git-clean부터 확인해버려서, "직전 apply가 남긴 리뷰 대기 중인 변경"만으로 재실행(멱등성 확인)이 막히는 문제 발견 → `findApplicableFixesByAuditRun`으로 적용 대상이 있는지 먼저 확인하고, **실제로 쓸 파일이 있을 때만** git-clean을 요구하도록 순서 수정.

**검증**: 실제 격리된 임시 Next.js 프로젝트(복사본, 별도 git repo)로 3개 통합 테스트 — (1) plan→apply→rollback 전체 흐름이 실제 파일을 반영하고 되돌림, (2) apply 2회 실행해도 sitemap에 URL이 한 번만 들어감(멱등), (3) git dirty면 plan 자체를 거부. 전부 실제 `next build` 통과까지 확인(목업 아님). + `sitemap-finding.ts` pure function 5개 테스트.

## 누적 테스트: 206/206 통과(Phase 1 145개 + 기존 1.5a 53개 무손상 + 신규 8개[sitemap-finding 5·통합 3])

## 남은 작업
- [ ] (1.5a 완결 후) 1.5b: GitHub 저장소 모드
- [ ] (향후, 필요시) gated 실제 fixer 1개(예: JSON-LD·canonical) 추가 시 approve/reject 실사용 경로 통합검증 — 지금은 add_safe(sitemap)만 있어 DB 상태머신 레벨(1.5a-6)에서만 검증됨
