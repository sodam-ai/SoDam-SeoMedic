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
- [ ] (향후, 필요시) gated 실제 fixer 1개(예: JSON-LD·canonical) 추가 시 approve/reject 실사용 경로 통합검증 — 지금은 add_safe(sitemap)만 있어 DB 상태머신 레벨(1.5a-6)에서만 검증됨

## 1.5a 검증 게이트: fix 툴 5개의 실제 MCP 프로토콜 레벨 동작 확인 — done
- 지금까지는 `planLocalFix`/`applyLocalFixes` **함수**를 직접 호출해서만 검증했음 — `server.ts`의 zod 스키마·툴 등록이 실제 MCP 클라이언트-서버 stdio 통신으로도 문제없이 동작하는지는 확인된 적 없었음(1.5b가 이 5개 툴의 내부 로직을 그대로 재사용할 예정이라 먼저 닫아야 할 검증 공백).
- `test/unit/server-integration-fix.test.ts`: 실제 `Client`/`StdioClientTransport`로 plan→apply→rollback 왕복 + git dirty 거부 메시지가 프로세스 크래시 없이 텍스트로 돌아오는지 확인. 2/2 통과.

## 1.5b (착수 — GitHub API를 직접 호출하지 않는 안전한 기반부터)

**계획서(`cheeky-whistling-yao.md`) 재검토 중 코드 대조로 발견한 설계 공백 4가지**(계획 단계엔 몰랐고, 1.5a의 실제 코드를 다시 읽어야만 드러난 것들):
1. **DB 영속성**: `openSeomedicDb(root)`는 DB를 root 하위에 강제로 만드는데, GitHub 모드가 sandbox 경로를 root로 쓰면 작업 후 sandbox를 지울 때 회귀 감지·중복PR 방지 이력이 통째로 사라진다 → `github/repo-cache-path.ts`(owner/repo로 식별되는 홈 디렉터리 하위 영속 캐시 경로) 신설로 해결. `planLocalFix(db, projectRoot)`가 이미 db 핸들과 파일 경로를 분리된 인자로 받으므로 기존 함수 시그니처 변경 없이 재사용 가능.
2. **`npm install` 누락 + 제3자 postinstall 스크립트 실행 위험**: sandbox clone 직후엔 node_modules가 없어 계획서에 없던 설치 단계가 필요했고, "남의 repo=fork+PR" 흐름은 신뢰 안 하는 제3자 코드의 postinstall을 그대로 실행하는 셈이라 임의 코드 실행 위험이 있음 → `github/npm-install.ts`가 `--ignore-scripts`를 기본 강제.
3. **clone 크기 제한 없음**: 계획서에 shallow 여부가 없었음 → `github/sandbox.ts`가 `--depth 1` 기본 + 저장소 크기 사전확인(주입 함수, 상한 초과 시 clone 자체를 시도하지 않음).
4. **모노레포 구조 한계**: sitemap fixer는 프로젝트 루트의 고정 경로만 찾음 — 지금 억지로 해결하지 않고 문서에 정직하게 남기기로 결정(범위 확장 보류).

**신규 모듈(전부 GitHub 실계정·실토큰 없이 완전 오프라인으로 검증됨)**:
- `github/types.ts`: `parseRepoUrl` — https/축약형(owner/repo) 파싱, github.com 외 호스트는 명시 거부(fail-closed).
- `github/repo-cache-path.ts`: 위 공백 1번 해결.
- `github/npm-install.ts`: 위 공백 2번 해결. **실측으로 발견한 Windows 버그 2건**: `spawn("npm",...,{shell:false})`→ENOENT, `spawn("npm.cmd",...,{shell:false})`→EINVAL(Node가 CVE-2024-27980 대응으로 .cmd/.bat 직접 spawn을 shell 없이 거부) → next와 동일하게 npm의 JS 진입점(`node_modules/npm/bin/npm-cli.js`, Node 설치본에 항상 번들됨)을 `process.execPath`로 직접 실행하는 방식으로 완전히 우회. yarn/pnpm은 Node에 번들되지 않아 위치를 안정적으로 추측할 수 없으므로 **지금은 지원하지 않음**(정직한 제약, shell 경유 우회 안 함).
- `github/sandbox.ts`: 위 공백 3번 해결 + 3중 정리(finally로 caller가 cleanup 호출 / exit·SIGINT·SIGTERM 핸들러 / `gcOrphanedSandboxes()`로 기동 시 1시간 넘은 잔해 GC).
- `github/git-exec.ts`: sandbox.ts·git-ops.ts가 공유하는 저수준 git 실행 헬퍼(argv 배열, shell:false).
- `github/git-ops.ts`: `assertSafeBranchName`(main/master 거부, `seomedic/` 접두사 강제) + `createFixBranch`/`commitAll`/`pushFixBranch`. 강제 push를 만들 수 있는 옵션이 코드에 물리적으로 없음(정적 grep 테스트로 확인).
- `db/migrations/0003_github_pr.ts`: `github_pr` 테이블 + `fix.github_pr_id` 컬럼. **실제로 겪을 뻔한 버그**: `ALTER TABLE ADD COLUMN`은 SQLite에 `IF NOT EXISTS`가 없는데 connection.ts는 모든 마이그레이션을 매 DB open마다 재실행하는 구조라, 그대로 뒀으면 두 번째 open부터 "duplicate column name"으로 죽었을 것 → `PRAGMA table_info`로 존재 확인 후 조건부 실행하는 `ensureFixGithubPrColumn()`으로 분리해 해결, 재현 테스트로 검증.

**검증**: 실제 로컬 bare git 저장소(`file://`)로 clone·shallow(`--depth 1`)·branch·commit·push 전체 흐름을 GitHub 없이 검증(계획서의 오프라인 테스트 전략과 동일). `--depth`가 순수 로컬 경로 clone에선 조용히 무시된다는 것도 실측으로 확인(`file://` URI로 강제해야 실제로 적용됨). postinstall 미실행도 실제 marker 파일 부재로 증명. 234/234 테스트 통과.

## 1.5b 순수 로직 + 오케스트레이션 배선 — done (GitHub 실계정 없이 DI로 완전 검증)

"실제 GitHub API 호출부"와 "판단·배선 로직"을 분리하면 후자는 전부 오프라인 검증 가능하다는 판단 하에
(sandbox.ts의 `fetchRepoSizeKb` 주입 패턴을 그대로 확장) 아래를 구현·검증했다:

- `db/repositories/github-pr.ts`: `github_pr` 테이블 CRUD + `findOpenGithubPrByBranch`(중복 판정의 DB쪽 조회).
- `github/pr-builder.ts`: `buildFixBranchName`(rule_id 기반 **결정론적** 브랜치명 — 매번 랜덤이면 중복 방지 자체가 무력화됨을 설계 검토에서 확인) + `buildPrContent`(PR 제목·본문, "add_safe도 무해 보장 안 함"·"자동 머지 안 함" 명시).
- `github/permission.ts`: `isOwnRepo`(대소문자 무관 비교) + `waitForForkReady`(주입된 확인 함수로 폴링, 상한 있음 — 무한 대기 금지).
- `github/policy.ts`: `evaluateRepoPolicy` — archived/disabled는 BLOCK, LICENSE/CONTRIBUTING 없으면 WARN만(순수 함수).
- `github/duplicate-guard.ts`: `checkDuplicatePr` — DB 조회 + 주입된 API 조회(`listOpenPrBranches`) 이중 확인(DB만 믿으면 사용자가 GitHub에서 직접 PR을 닫아도 SeoMedic이 모름).
- `github/api-client-port.ts`: `GithubApiClient` 인터페이스만 정의(실제 옥토킷 구현은 아직 없음) — `orchestrator.ts`가 이 인터페이스에만 의존해, 가짜(fake) 구현을 주입하면 전체 흐름을 실제 GitHub 없이 검증 가능. `getCloneUrl(ref)`를 인터페이스에 넣은 이유: clone URL을 orchestrator가 직접 하드코딩하면 테스트가 실제 GitHub 없인 아예 불가능해짐(설계 중 발견).
- `github/orchestrator.ts`: `runGithubFix` — 로그인 확인 → 정책 검사(차단 시 조기 중단) → 내 repo/fork 판별(+fork 폴링) → sandbox clone → npm install → **`planLocalFix`/`applyLocalFixes`(1.5a 로직 그대로 재사용)** → 중복 검사 → 브랜치+커밋+push → PR 생성 → `github_pr` 기록. gated 항목은 대화형 승인이 불가능한 1회성 흐름이라 자동 적용하지 않고 "확인됨" 목록으로만 보고(add_safe fixer만 있는 지금은 문제 없음, gated fixer 추가 시 재검토 필요).
- `fix-orchestrator/plan.ts`에 작은 추가 변경 2건(1.5a 동작 100% 유지, 기본값 생략 시 이전과 동일):
  - `projectTargetOverride` 옵션 추가 — **두 번째 층의 영속성 버그**를 발견해 해결: `repo-cache-path.ts`로 DB *파일*은 영속화했지만, `planLocalFix`가 `Project.target`에 sandbox 경로(매번 새로 생김)를 그대로 썼다면 같은 DB 안에서도 매번 새 Project로 취급돼 회귀 이력이 여전히 안 쌓였을 것.
  - `FixPlanResult.projectId` 노출 — orchestrator가 `github_pr` 기록 시 재조회 없이 바로 쓰도록.

**실제 실행으로 발견·수정한 버그 2건 더**(설계 검토만으론 못 잡음):
1. `npm install --ignore-scripts`도 `package-lock.json`을 정규화해 sandbox를 dirty로 만듦 → `planLocalFix` 호출 전 git 상태를 재확인해 필요시 자동 원복(로컬 fix 모드의 build-후-dirty 버그와 같은 유형, 다른 트리거).
2. **테스트 격리 버그**(프로덕션 코드는 정상): `getGithubRepoCacheRoot`가 owner/repo로 영속되도록 설계했는데, 테스트 4개가 전부 같은 REPO_REF를 써서 한 테스트가 실제로 남긴 `github_pr` 기록을 나중 테스트(심지어 다음 세션 재실행까지)가 "이미 PR 있음"으로 오판 — 실행할 때마다 간헐적으로 실패하는 원인이었음. 매 테스트 전 해당 owner/repo의 영속 캐시를 강제로 비우는 것으로 해결, 연속 2회 재실행으로 재현성 확인.

**검증**: 가짜 `GithubApiClient`(로컬 git 저장소를 clone 소스로 제공) + 실제 nextjs-minimal 픽스처로 4가지 시나리오 실제 실행 — (1) 정책 통과→내 repo→clone+**실제 npm install**+plan+apply+PR 생성 전체 흐름, (2) archived 저장소는 clone 전에 즉시 차단, (3) 중복 PR이면 적용·PR 생성 없이 건너뜀, (4) 남의 repo면 fork 존재 확인→생성→폴링. 259/259 테스트 통과, 빌드·`npm audit`(고위험 0) 확인.

## api-client.ts + MCP 툴 등록 — 코드 작성 완료(타입체크만, 실제 GitHub 미검증)

**경계 재검토**: "GitHub API를 실제로 호출하는 코드는 아예 안 쓴다"는 이전 결정을 다시 봤더니 일관성이
없었다 — `token.ts`(실 인증정보 다루는 코드)는 이미 작성해두고 "미검증"이라고만 표시했었는데,
`api-client.ts`만 작성 자체를 거부한 건 같은 원칙을 다르게 적용한 것. **위험한 건 "코드가 존재함"이
아니라 "실제로 호출함"** — 그래서 코드는 작성하되 실행은 여전히 보류하는 쪽으로 경계를 재조정했다.

- `github/api-client.ts`: `@octokit/rest`로 `GithubApiClient` 인터페이스 실구현. 실행 전 실제 설치된
  `@octokit/rest`에서 `repos.get/getCommunityProfileMetrics/createFork`, `pulls.list/create`,
  `users.getAuthenticated` 메서드가 실제로 존재하는지 직접 확인(`typeof` 체크) 후 작성 — 이름 자체는
  틀릴 위험이 없게 했지만, **응답 필드 형태(특히 `createFork`의 owner/name 위치,
  `getCommunityProfileMetrics`의 license/contributing null 판정)는 실제 응답으로 재확인 못 함** —
  실사용 시 가장 먼저 깨질 가능성이 있는 지점으로 파일 상단에 명시.
- `server.ts`에 `seomedic_fix_github` MCP 툴 1개 등록 — 설명에 "⚠️ 미검증" 명시, `SEOMEDIC_GITHUB_TOKEN`
  없으면 거부. `commands/seo-fix.md`에 GitHub 저장소 절차 추가(실행 전 사용자에게 실험적 기능임을
  반드시 알리도록 지시, gated 항목은 1회성 흐름이라 자동 적용 안 되고 보고만 된다는 점 명시).

**검증(전부 실행이 아니라 정적/구조적 검증)**: `tsc` 타입체크 통과(파라미터 형태까지 검증됨) +
MCP 프로토콜로 `seomedic_fix_github` 툴이 스키마와 함께 실제로 노출되는지 확인(**호출은 하지 않음** —
fork·PR 생성은 자동화 테스트에서 실행하기엔 되돌리기 어려운 부작용이 있음). 260/260 테스트 통과,
빌드·`npm audit`(고위험 0) 확인.

## 읽기 전용 부분 실증 — done (토큰 없이, 부작용 없이 가능한 만큼 검증)

**새로 발견한 사실**: "GitHub 실증은 토큰이 있어야만 가능하다"는 이전 전제가 절반은 틀렸다 — GitHub REST API는
**공개 저장소 읽기 전용 조회는 토큰 없이도 가능**하다(속도 제한만 있음, 부작용 0). `api-client.ts`의
읽기 메서드와 쓰기 메서드를 나눠서 봤어야 했는데 뭉뚱그려 판단했던 게 판단 착오였다.

**실증 방법**: 1회성 프로브 스크립트(`_probe_octokit_readonly.mjs`, 검증 후 삭제)로 GitHub 공식
테스트용 공개 저장소(`octocat/Hello-World`, 토큰 없이)를 대상으로 `repos.get`·
`repos.getCommunityProfileMetrics`·`pulls.list`를 실제로 호출.

**결과**: `api-client.ts`가 가정한 필드 형태가 **전부 실제 응답과 정확히 일치함을 확인**:
- `repos.get` → `archived`/`disabled`/`license`/`size`/`default_branch`/`fork` 전부 존재·형태 일치
- `getCommunityProfileMetrics` → `files.license`/`files.contributing`이 null 가능한 필드로 정확히 일치
- `pulls.list` → `head.ref`가 브랜치명 필드로 정확히 일치

`api-client.ts` 상단 주석을 "미검증"에서 "읽기 경로는 확인됨, 쓰기 경로(`createFork`/`createPullRequest`/
`getAuthenticatedLogin`)만 남음"으로 갱신. 260/260 테스트 통과(코멘트만 수정, 로직 변경 없음 — 참고로
이 전체 스위트 재실행 중 1회 일시적 실패가 있었으나 직후 재현 시도 2회 모두 260/260으로 통과해 이 변경과
무관한 일시적 현상으로 판단, 실제 I/O가 많은 스위트 특성상 발생 가능).

**다음 단계(실제 GitHub 토큰·계정의 명시적 동의가 있어야만 가능 — 더 이상 줄일 수 없는 마지막 관문)**:
- `getAuthenticatedLogin`(인증 필요), `createFork`(실제 저장소를 만드는 되돌리기 어려운 부작용),
  `createPullRequest`(실제 PR을 만드는 되돌리기 어려운 부작용) — 이 세 가지만 남았다.
- `seomedic_fix_github`를 실제로 1회 호출해 전체 흐름이 진짜로 동작하는지 확인.
- 위 실증 전까지 GitHub 모드는 "완료"가 아니라 "구현됨·읽기경로검증됨·쓰기경로미검증"으로 표시한다.

## GitHub 쓰기 경로 실증(내 저장소 시나리오) — done (2026-07-04, 실제 GitHub·실제 토큰)

사용자가 직접 발급한 fine-grained PAT(저장소 1개로 범위 제한, 7일 만료)와 실제로 새로 만든 테스트
저장소(`sodam-ai/seomedic-write-test`)로 `runGithubFix()`를 직접 호출해 실제 GitHub에서 검증했다
(MCP 서버가 아니라, `createOctokitGithubClient`+`runGithubFix`를 임시 스크립트로 직접 호출하는 방식 —
이유: MCP 서버는 Claude Code 앱의 자식 프로세스라 별도 터미널에서 설정한 환경변수가 전달되지 않아서,
같은 프로세스 안에서 토큰을 읽어 바로 호출하는 방식으로 우회함).

**실제로 확인된 것**:
- `getAuthenticatedLogin` — 실제 인증 성공
- `getRepoMeta` + `evaluateRepoPolicy` — LICENSE/CONTRIBUTING 부재를 정확히 경고(차단 아님)로 분류
- `isOwnRepo` — 내 저장소로 정확히 판별(fork 미실행 — 아래 한계 참고)
- 실제 clone → npm install → 크롤 → 규칙평가 → sitemap 누락 URL 자동수정(add_safe) → build 재검증 → 커밋 → 브랜치 push
- `createPullRequest` — **실제 PR 생성 확인**: https://github.com/sodam-ai/seomedic-write-test/pull/1

**과정에서 발견한 사실(전부 테스트 준비 과정의 실수였지 제품 코드 결함 아님, 재현 순서대로)**:
1. Fine-grained 토큰은 저장소를 선택해도 Repository permissions를 별도로 추가+저장(Update)해야
   실제로 반영됨 — 스크린샷으로 직접 확인.
2. 신규 저장소에 `.gitignore` 없이 `node_modules`를 그대로 두면 npm install 후 untracked 상태가 되어
   기존 dirty-복구 로직(`revertViaGitCheckout`, tracked 변경만 되돌림)으로는 못 지움 — orchestrator의
   버그가 아니라 "실제 저장소엔 보통 .gitignore가 있다"는 당연한 전제가 테스트 저장소엔 없었던 것.
3. 크롤러는 링크를 따라가는 방식이라, 페이지가 파일로 존재해도 어디서도 링크가 없으면 발견되지 않음
   (sitemap 자동수정 조건을 실제로 충족시키려면 홈페이지에 링크를 추가해야 했음).

**아직 남은 것(정직하게 축소하지 않음)**: 이번 시나리오는 "내 저장소"라 `createFork`는 실행되지 않았다.
"남의 저장소 → fork → PR" 경로(PRD 72행이 명시한 별도 요구사항)는 여전히 가짜(fake) client로만
검증됐고, 실제 GitHub의 `createFork` 응답 형태는 미확인 상태로 남는다. 이걸 닫으려면 별도 계정 소유의
저장소(또는 협업자 권한이 있는 제3자 저장소) 하나가 추가로 필요하다.

**후속 정리 완료(2026-07-04)**: 테스트에 쓰인 토큰은 사용자가 폐기 완료 확인함. 테스트 저장소
(`sodam-ai/seomedic-write-test`)도 사용자가 GitHub 웹에서 직접 삭제 완료(`gh repo delete`는 CLI
토큰에 `delete_repo` scope가 없어 403으로 실패 — 계정 전체 삭제권한을 이 작업 하나 때문에 새로 받는
게 오히려 위험 범위가 커서 권장하지 않았고, 사용자가 웹에서 직접 삭제). PR #1은 저장소 삭제와 함께
자동으로 사라짐.

---

## 프로젝트 전체 최종 상태 (Phase 1 + 1.5a + 1.5b 종합 — 정직한 한계 2건 포함)

PRD(`01_PRD.md`/`03_PHASES.md`)의 성공기준을 항목별로 실제 증거(테스트 통과·실행 로그·코드)와
대조한 결과, 아래 **2건을 제외한 전체 성공기준이 충족**됨을 확인했다. 이 2건은 코드로 해결할 수 없고
사용자의 행동(다른 OS 환경 또는 GitHub 토큰 제공)이 필요한 항목이라 별도로 명확히 분리한다.

### 남은 한계(2026-07-04 갱신 — 축소·은폐 없이 명시)
1. **크로스플랫폼(Mac/Linux) 미검증** — `CHECKPOINT.md` M9-3에 이미 기록됨(Windows만 실측, 이 개발
   환경이 Windows라 물리적으로 Mac/Linux 실행 확인 불가). 코드 자체는 `path.join`·argv 배열 등
   이식성 있게 작성했으나 실제 실행 확인은 못 함. **변화 없음.**
2. ~~GitHub 쓰기 경로 미검증~~ → **"내 저장소" 시나리오는 실제 GitHub PR(#1)로 검증 완료**
   (`getAuthenticatedLogin`/`createPullRequest`/커밋·push 전부 실증). 다만 **"남의 저장소 → fork → PR"
   경로(PRD 72행 요구사항)는 여전히 fake client로만 검증됨** — `createFork`의 실제 응답 형태 미확인.
   안전장치(강제 push 금지·자동 머지 금지·중복 방지·gated 미승인 보호)는 이미 실제 테스트로 검증 완료.

### 결론
Mac/Linux 1건은 그대로 남아있고, GitHub 쓰기 경로는 **부분적으로 닫혔다** (내 저장소=완료,
fork 경로=미완료). **PRD가 정의한 나머지 모든 성공기준(Phase 1 분석·회귀, Phase 1.5a 로컬 수정,
Phase 1.5b의 add_safe·gated·멱등·PR-only 원칙)은 실제 실행 증거로 충족을 확인했다.** 남은 두 항목은
숨기지 않고 이 문서와 `CHECKPOINT.md`에 각각 명시했으며, 사용자가 여유가 될 때(Mac/Linux 환경 접근,
또는 제3자 저장소로 fork 경로 재검증) 마저 닫을 수 있는 잔여 항목으로 남겨둔다.

---

## 다음 세션 인계 (Handoff) — 2026-07-04 세션 종료 시점

**새 세션에서 이 프로젝트를 이어받으면, 아래를 먼저 읽고 시작할 것.** 이 세션에서 이미 끝난 검증을
중복 실행하지 않도록, "이미 확인됨"과 "아직 안 됨"을 명확히 구분해둔다.

### 지금 git 상태(반드시 먼저 확인)
- 로컬/원격 모두 브랜치 `docs/phase1.5-verification-and-guides`에 최신 작업이 push되어 있음
  (커밋 2개: CHECKPOINT_1.5.md 갱신, README/GUIDE/FAQ/TROUBLESHOOTING 문서 세트).
- **`master`에는 아직 병합되지 않음.** 병합 여부를 사용자에게 물었으나 세션 종료 시점까지 응답 없어
  보류된 상태 — 다음 세션 시작 시 `git branch`/`git status -sb`로 실제 상태를 먼저 확인하고,
  사용자가 병합을 원하면 새 PR 없이 fast-forward merge로 처리(이 저장소는 1인 개발·브랜치 전략
  없음이 이미 확인된 상태라 별도 리뷰 절차 불필요 판단).
- 커밋 전 실행한 `npm run typecheck && npm run build && npm run test`는 전부 통과(260/260) 확인된
  상태이며, 이후 소스 코드 변경은 없었으므로(문서만 수정) 재검증 없이 신뢰 가능.

### 이미 끝나서 다시 안 해도 되는 것
- GitHub 쓰기 경로 "내 저장소" 시나리오: 실제 GitHub에 진짜 PR 생성까지 완료 검증(테스트 저장소·PR은
  검증 후 삭제 완료, 토큰도 사용자가 폐기 완료).
- 문서 8종(README/GUIDE/FAQ/TROUBLESHOOTING × 한/영) + html 미러 8개: 전부 작성·커밋·push 완료.
- GitHub About 설명: GitHub PR 모드 반영해 갱신 완료. Topics는 기존 8개 유지(변경 불필요 판단).

### 남은 것(우선순위 순, 전부 사용자 결정/행동 필요 — 코드로 대신 해결 불가)
1. **`docs/phase1.5-verification-and-guides` → `master` 병합 여부** — 위 참고, 사용자 확인 시 즉시 처리 가능.
2. **LICENSE 저작권자명·연도 확정** — `LICENSE` 1~3행이 아직 `[COPYRIGHT HOLDER — 확정 필요]` placeholder.
3. **법무 검토 6건(L1·L2·L4·L5·L12·L13)** — `CHECKPOINT.md` 113행 참고, 코드 문제 아니고 법적 판단 필요.
4. **Mac/Linux 실행 검증** — 개발 환경이 Windows뿐이라 물리적으로 불가, 다른 OS 환경 필요.
5. **GitHub "fork(남의 저장소)" 경로 실증** — 별도 계정 소유 저장소가 있어야 검증 가능(1번과 무관하게 언제든 진행 가능).
6. **Phase 2(구조화데이터·GEO·GSC/GA4/PSI 연동) 착수** — PRD `03_PHASES.md` 85~106행. **새 세션에서 인터뷰/스펙부터 시작 권장**
   (이유: GSC·GA4·PSI 3개 외부 인증을 한번에 새로 설계해야 하고, PRD 자체가 "GEO는 프로세스 지표"라 성공기준부터 좁혀야 함).

### 이 문서 다음으로 참고할 파일
- `.PRD/03_PHASES.md` — Phase 2 시작 시 최우선 참고
- `CHECKPOINT.md` — Phase 1 상세 이력(M0~M9)
- `AUDIT.log` — 마일스톤 단위 이벤트 기록(이 세션 작업분 하단에 추가됨)

---

## 2026-07-06 세션 — 인계 검증 + 정리 작업

`.PRD/` 5개 문서 전체와 위 "다음 세션 인계" 6개 항목을 실제 코드(`fixers/registry.ts`,
`packages/plugin/commands/`, `packages/plugin/skills/`)와 직접 대조 검증했다. **6개 항목은
전부 실측과 정확히 일치**했다(그대로 신뢰 가능했던 것으로 확인).

**인계 문서에 없던 결함 1건을 새로 발견·수정**: `skills/seomedic/SKILL.md`가 "소스 코드 자동 수정
요청 → 아직 미지원(Phase 1.5 예정)"이라는 스테일 문구를 그대로 갖고 있었다. 실제로는
`commands/seo-fix.md`가 완전히 구현되어 실제 GitHub PR(#1)까지 검증된 상태라, 자동 활성 스킬이
Claude에게 존재하는 기능을 "없다"고 잘못 안내하도록 지시하는 살아있는 버그였다. 문구를 실제
상태(로컬 fix 검증완료 / GitHub 내 저장소 검증완료 / fork 경로만 실험적)로 정정했다.

**처리 완료**:
1. **`docs/phase1.5-verification-and-guides` → `master` 병합** — fast-forward로 완료(충돌 0,
   `e38d2af..b3e52c8`).
2. **LICENSE 저작권자명** — 임시로 **"SoDam AI Studio"(2026)**로 채움. ⚠️ 이건 사실관계만 채운
   것이고, **MIT 채택 자체·copyleft 검토(L1·L2)는 여전히 법무 검토 대기**다. 최종 문구는 별도
   세션에서 README/가이드 정리와 함께 재확인 예정(사용자 지시).
3. **`.github/workflows/ci.yml` 신설** — ubuntu/macos/windows × Node 22 매트릭스로
   typecheck+build+test+audit 자동화. **주의**: 지금까지 `.github/workflows` 자체가 없어 260/260
   테스트는 전부 로컬 Windows 1회성 수동 실행뿐이었다(master push 자동 게이트 부재였음, 이번에
   신설). 이 CI는 "Mac/Linux 미검증" 한계를 **완전히 닫지 못한다** — 최소 타입체크·빌드·유닛테스트
   레벨의 3-OS 자동 검증으로 **리스크를 낮추는 것**뿐이며, 실제 `/seo-audit`·`/seo-fix` MCP 툴을
   사람이 다른 OS에서 써보는 것과는 다르다. **첫 push 후 Actions 탭에서 3-OS 잡이 실제로 통과하는지
   반드시 확인 필요**(특히 `better-sqlite3` 네이티브 모듈의 3-OS prebuilt binary 동작은 사전 보장
   불가 — 미검증 지점으로 정직하게 남김).

**여전히 남은 것(변경 없음, 사람 행동 필요)**:
- 법무 검토 6건(L1·L2·L4·L5·L12·L13)
- GitHub "fork(남의 저장소)" 경로 실증(별도 계정 소유 저장소 필요)
- Mac/Linux **실제 실행**(수동) 검증 — 아래 CI 그린은 부분 완화일 뿐, 완전한 대체 아님
- Phase 2(구조화데이터·GEO·GSC/GA4/PSI) 착수 — 여전히 "새 세션 인터뷰/스펙부터" 권고

### CI 첫 실행 결과 — 3-OS 전부 그린 확인(2026-07-06)

`.github/workflows/ci.yml` push 직후 실제로 4번의 반복(각 실패 → 원인 특정 → 수정 → 재푸시)을 거쳐
**windows-latest(23m6s)·ubuntu-latest(6m41s)·macos-latest(3m19s) 전부 통과**했다(run
[28749891235](https://github.com/sodam-ai/SoDam-SeoMedic/actions/runs/28749891235)). CI가 처음부터
그냥 통과한 게 아니라 **4개의 실제 결함을 순서대로 잡아냈다**는 점이 중요하다(전부 로컬 Windows
개발환경에서는 가려져 있던 문제들 — "CI가 필요 없었다"가 아니라 "CI가 없어서 몰랐다"였음을 실증):

1. **`tsconfig.test.json` 스코프 결함** — `test/**/*.ts` 글롭이 독립된 Next.js 프로젝트인
   `test/fixtures/nextjs-minimal/`(자체 tsconfig·package.json·node_modules 보유)까지 잘못 쓸어담아
   `next` 모듈을 못 찾고 실패(TS2307). 로컬은 그 픽스처의 node_modules가 이미 있어 우연히 통과.
   → `exclude`에 픽스처 경로 추가.
2. **픽스처에 `typescript`/`@types/node` 누락** — 픽스처가 tsconfig.json으로 TypeScript를 쓰면서도
   두 패키지를 devDependencies에 선언 안 함. 로컬에서는 (이유 불명확하나) 통과했지만 CI 클린
   설치에서는 Next.js가 빌드 자체를 거부. → 두 패키지 명시 추가 + `pretest` 훅으로 픽스처 설치 자동화
   (이전엔 픽스처 의존성 설치가 문서화 안 된 수동 1회성 작업이었음).
3. **`github/npm-install.ts`의 `resolveNpmCliJs` Unix 레이아웃 미대응** — "npm-cli.js는 node
   실행파일과 같은 폴더"라는 가정이 Windows 배포에서만 참이고, 표준 Unix 배포(`<prefix>/bin/node` +
   `<prefix>/lib/node_modules/npm`)에서는 거짓이라 ubuntu-latest·macos-latest에서 실제로 실패.
   → `npm_execpath` 환경변수 우선 확인 + 두 OS 레이아웃 후보 확인으로 수정. **이게 바로 "Mac/Linux
   미검증" 리스크가 실제로 걸린 사례**(추측이 아니라 실측으로 확인).
4. **vitest `hookTimeout` 부족** — `fix-orchestrator-integration.test.ts`의 `afterEach`가 픽스처
   전체 복사본이 든 임시 폴더를 정리하는데, 이 정리가 vitest 기본 hookTimeout(10초)을 초과해
   windows-latest에서만 "Hook timed out" 오탐 실패(로직 결함 아님, 순수 CI 디스크 I/O 속도차).
   → `hookTimeout: 60_000`으로 상향.

**결론**: CI 매트릭스가 "Mac/Linux 미검증" 리스크를 완전히 닫진 못하지만(수동 실행 확인은 여전히
아님), 최소 typecheck+build+260개 유닛테스트 레벨에서는 이제 3-OS 전부 실측 그린이다. 위 4건 중
3번(npm-cli.js) 은 실제 제품 코드(GitHub PR 모드)의 진짜 크로스플랫폼 버그였다는 점에서, 이번 CI
신설 자체가 "미검증"으로만 남아있던 리스크를 구체적 결함으로 전환·수정한 실질적 성과다.
