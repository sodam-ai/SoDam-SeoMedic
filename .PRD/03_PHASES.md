# SeoMedic — Phase 분리 계획

> 개정: v2.5 (최종 — 수정기 Phase 1.5 격리 + GitHub 저장소 모드·보안/법률/문서 배포 게이트 반영)
> 우선순위 원칙(자료 22장): 기술 SEO → 콘텐츠·엔티티 → 구조화 → GEO/AEO → 측정.

> **v1.1 재구성 이유(강력 추천)**: 원안은 Phase 1에 크롤·렌더·규칙엔진·**수정기·승인·회귀**까지 다 넣어 4~6주에 비현실적이었고, 치명 결함(fix 렌더 브릿지·safe 경계·롤백)이 전부 "수정기"에 몰려 있었다. → **분석+회귀를 먼저 완결(Phase 1)**, 위험한 수정기를 **Phase 1.5로 분리**해 리스크를 격리한다. *(확인됨 — 리뷰 지적)*

---

## Phase 1: 분석 + 회귀 (MVP, 예상 4~6주 — 주: 마켓 배포·보안/법률/문서 게이트 포함이라 게이트 비중 크면 재산정)

### 목표
아무 URL이나 신뢰성 있게 진단하고, 재검사 때 원복까지 잡는 **분석 전용 완결 도구**. (수정 없음 = 안전)

### 기능
- [ ] **기술 SEO 분석 엔진** — 크롤 + Playwright 렌더 → 크롤가능성·인덱싱·canonical·상태코드·리다이렉트·**raw vs 렌더드 DOM 비교**·CWV(3회 중앙값)
- [ ] **회귀 자동 감지** — 안정 키(page_url+rule_id+rule_version) 베이스라인 diff, 원복 vs 의도 구분
- [ ] **우선순위 리포트** — 임팩트 순 + Markdown/JSON
- [ ] **크롤 안전장치** — max-pages·depth·rate-limit·robots.txt 준수·식별 UA (04_SPEC 크롤 정책)

### 데이터
- Project, AuditRun, Page, Finding(+finding_key/rule_version), Baseline, Regression

### 전제/설치
- **Playwright 브라우저 바이너리(수백MB) 설치 필요** → 첫 실행 시 자동 설치 안내 또는 시스템 Chrome 채널 사용.

### "진짜 제품" 체크리스트 (분석 도구)
- [ ] 실제 라이브 URL 크롤·렌더 (목업 X)
- [ ] known-good/known-bad 픽스처로 **오탐 0·핵심 규칙 재현율 ≥90%** 검증
- [ ] CWV 3회 중앙값 + "lab≠field" 명시
- [ ] `npx`/스킬로 남이 실제 실행 가능(브라우저 설치 안내 포함)
- [ ] 제3자 사이트 1개로 end-to-end
- [ ] **마켓 플러그인으로 설치 → 다른 프로젝트에서 `/seo-audit` 실행** 검증(Win/Mac/Linux)
- [ ] **배포 게이트**: SECURITY.md·DISCLAIMER.md·~~MIT~~**라이선스(Apache-2.0 채택 확정, 2026-08-10)**·"소유 사이트만" 경고·텔레메트리 0 확인
- [ ] **보안 Must-Have 게이트(04_SPEC)**: SSRF·명령어주입·경로조작·시크릿노출·SQLi 방지 + `npm audit` 고위험 0 통과
- [ ] **법률 게이트(04_SPEC)**: LICENSE+저작권자·의존성 라이선스 스캔(copyleft 0)·THIRD_PARTY_NOTICES·타인 자료 0·크롤 콘텐츠 미동봉·DISCLAIMER 고지 + 법무 검토 필요 항목 표시
- [ ] **문서 게이트(04_SPEC)**: 왕초보용 README(전 목차)·빠른시작·명령어·**TROUBLESHOOTING 매트릭스**·FAQ·법률/면책 완비 — 문서 없이는 '완료' 아님

### Phase 1 시작 프롬프트
```
이 PRD를 읽고 Phase 1(분석+회귀)만 구현해주세요. 수정기는 Phase 1.5입니다.
@.PRD/01_PRD.md @.PRD/02_DATA_MODEL.md @.PRD/04_PROJECT_SPEC.md

Phase 1 범위:
- 기술 SEO 분석 엔진 (크롤 + Playwright 렌더 + raw/rendered 비교 + CWV 3회 중앙값)
- 회귀 감지 (안정 키 = page_url+rule_id+rule_version 베이스라인 diff, 원복/의도 구분)
- 리포트 (Markdown/JSON)
- 크롤 안전장치 (max-pages·depth·rate-limit·robots 준수·식별 UA)

반드시 지켜야 할 것:
- 04_PROJECT_SPEC.md "절대 하지 마" 준수
- 실제 크롤 (목업 X)
- 이 Phase에선 소스 파일을 수정하지 않는다(분석 전용)
- 권한 없는 사이트 무단 크롤 금지
```

---

## Phase 1.5: 수정기 (예상 2~3주)

### 전제 조건
- Phase 1 분석·회귀가 안정 동작

### 목표
**Next.js 소스 프로젝트**를 안전하게 실제 수정(승인형). 다른 스택은 제안만. 대상은 **로컬 폴더 또는 GitHub 저장소**(저장소는 clone→브랜치→PR로 제출).

### 기능
- [ ] **렌더 브릿지** — 폴더 → `next build && next start`(또는 `next dev`) 기동 → 헬스체크 → 로컬 URL → 그 URL로 진단. 포트·타임아웃·기동실패 처리
- [ ] **추가형 자동 수정(add_safe)** — "없는 것만 추가"(빠진 sitemap 항목). 기존 값 덮어쓰기 금지. *(2026-08-09 정정: OG는 실제로 gated 구현 — `04_PROJECT_SPEC.md` "safe/gated 경계" 표 참고)*
- [ ] **승인 게이트(gated)** — canonical/noindex/robots/**sitemap/JSON-LD/title/meta/alt**는 검증(스키마·빌드) + diff 승인 후 적용
- [ ] **안전 실행** — 적용 후 `build` 통과 확인, git clean 아니면 백업/중단, 멱등 삽입(마커)
- [ ] **GitHub 저장소 모드** — repo를 임시 sandbox에 clone → 새 브랜치에 수정 → **PR 생성(제안)**. 내 repo=브랜치+PR, 남의 repo=**fork+PR**. **기본 브랜치(main) 직접 push·force-push·자동 머지 절대 금지**(머지는 사람이 결정), GitHub 토큰은 최소 권한·env-only

### 데이터
- Fix(risk_level, dry_run_diff, validation, idempotency_marker)

### 성공기준
- [ ] add_safe 수정이 실제 파일 반영 + `build` 통과
- [ ] gated 항목은 승인 없이 절대 미변경
- [ ] fix 2회 실행해도 중복 없음(멱등)
- [ ] GitHub 저장소 수정 시 **PR만 생성**(main 직접 push 0), 남의 repo는 fork 경유, 자동 머지 0

---

## Phase 2: 구조화·GEO 기초 + 성과 연동 (예상 3~4주)

### 전제 조건
- Phase 1 + 1.5 안정

### 목표
콘텐츠·구조화·AI "입력 위생" + 실제 검색 성과 데이터.

### 기능
- [ ] **구조화데이터·on-page** — JSON-LD 생성·검증, title/meta/h/alt/OG
- [ ] **GEO/AEO 기초** — AI 크롤러 정책(OAI-SearchBot/GPTBot, Claude-SearchBot/ClaudeBot 구분), Q&A 구조. **AI 노출 보장 X**
- [ ] **GSC/GA4/PSI 연동** — 서비스계정 JSON(env), **본인 소유 속성만**, field CWV 결합

### 성공기준 (⚠️ GEO는 결과가 아닌 프로세스 지표)
- [ ] AI 크롤러 정책이 robots/헤더에 **정확히 적용됨**(검색봇 허용·학습봇 차단)
- [ ] JSON-LD가 **Rich Results/스키마 검증 통과** + 페이지 내용과 일치(환각 0)
- [ ] Q&A 구조·검증가능 수치가 존재(노출 여부는 측정 대상 아님 — 비결정적)
- [ ] field(CrUX) 데이터가 리포트에 결합됨
- [ ] **토큰 보안(S2)**: 서비스계정 JSON은 env 경로만, 평문 토큰 저장 0, 최소 scope, 본인 소유 속성만

### 통합 테스트
- Phase 1/1.5 기능이 여전히 정상 동작

---

## Phase 2-B: AEO·OG·파비콘 확장 (사용자 요청 2026-10-11 · **배치 확정 대기**)

> 사용자 요청: *"AEO/OG(오픈그래프)/파비콘 관련 기능까지 있었으면 좋겠음."* 이 절은 **요구·설계·위험의 등록**이다(구현 아님). "2-B 신설 vs 기존 Phase 2 확장"은 `05_COVERAGE_MAP.md` 미결 결정 2와 같은 문제라 사용자가 정한다. 요구 체크리스트 정본은 `01_PRD.md` §5 "확장 요구".

### 목표
공유 미리보기(OG)·브라우저/검색결과 아이콘(파비콘)·답변 엔진이 읽기 좋은 페이지 구조(AEO)를 **진단**하고, 가능한 범위 — *이미 있는 값의 복사*, *이미 있는 파일의 연결* — 만 **승인형으로 수정**한다. 페이지에 없는 값(이미지·type·alt·아이콘·답변)은 지어내지 않는다.

### 전제 조건
- Phase 2 코어 안정.
- **SSRF 가드 보강이 먼저다.** 이미지·아이콘 확인은 *새 네트워크 요청*이라 기존 가드의 구멍이 그대로 새 공격면이 된다. 2026-10-11 실측: ① 대괄호 IPv6 리터럴(`http://[::1]/`)이 진입 검사를 통과해 `safeFetch`가 내부 서버 본문을 가져왔고 ② IPv4-매핑 IPv6의 16진 표기가 사설 주소로 판정되지 않았다. 수정은 브랜치 `fix/lighthouse-ssrf-proxy`에서 **진행 중·미커밋**(CHECKPOINT 2026-10-11 참고). 이것이 병합되기 전에 자산 확인 기능을 만들지 않는다.

### 근거 — 1차 출처 (확인일 2026-10-11)

| 주제 | 확인된 사실 | 출처 |
|---|---|---|
| 파비콘 발견 | Google은 **홈페이지** `<head>`의 `<link>`(rel: `icon`·`shortcut icon`·`apple-touch-icon`·`apple-touch-icon-precomposed`)로 찾는다. `/favicon.ico` 루트 대체 탐색은 문서에 **언급 없음**(단정 금지) | developers.google.com/search/docs/appearance/favicon-in-search (갱신 2026-08-28) |
| 파비콘 규격 | 정사각형(1:1) **8×8 이상 필수**, **48×48 초과 권장**. *48의 배수 요구는 없다.* 지원 형식 BMP·GIF·ICO·PNG·JPEG·PPM·TIFF — **SVG는 목록에 없다** | 동일 |
| 파비콘 크롤링 | Googlebot-Image가 파비콘을, Googlebot이 홈페이지를 크롤할 수 있어야 한다. 같은 호스트일 필요 없음(CDN 가능), 호스트당 1개(하위 경로는 불가), URL은 안정적으로. 표시를 보장하지 않음 | 동일 |
| OGP 명세 | 필수 4종 `og:title`·`og:type`·`og:image`·`og:url`. 부속 `og:image:alt`(이미지를 설정하면 함께 권장)·`secure_url`·`type`·`width`·`height`, 선택 `og:description`·`og:site_name`·`og:locale`(기본 en_US). 마크업이 없는 페이지는 `og:type=website`로 **간주**. `og:image`가 절대 URL이어야 하는지는 명세에 **명시 없음**(예시는 모두 전체 URL) | ogp.me |
| Google AI 기능 | AI Overviews·AI Mode에 나오기 위한 **추가 요건·특별한 최적화 없음**, AI 전용 텍스트 파일·마크업 **불필요**, SEO 모범사례가 그대로 유효, 특별한 schema.org 불필요(구조화 데이터는 가시 텍스트와 일치 권장). llms.txt·AEO·GEO 용어는 언급 없음 | developers.google.com/search/docs/appearance/ai-features (갱신 2025-12-10) |
| FAQ 리치결과 | **2026-05-07부터 Google 검색에 더 이상 표시되지 않음**(변경 이력 2026-05-08 공지·2026-06-15 문서 제거). FAQPage 마크업 자체의 허용 여부는 확인하지 못함 | developers.google.com/search/docs/appearance/structured-data/faqpage 의 변경 이력 |

> ⚠️ 위 표는 문서를 요약해 읽은 결과다. **구현 착수 전 원문으로 재확인**하고 코드 주석에 확인일을 남긴다(`ai-crawler-policy.ts` 관례). 플랫폼(Facebook·카카오톡·X)별 이미지 규격·절대 URL 요구는 **이번에 확인하지 못했다** — 확인 전에는 "권장"으로만 표시하고 임의 임계값을 쓰지 않는다.

### 공통 선행 인프라 — 한 번 만들어 3개 영역이 공유
1. **안전한 자산 확인 모듈**: `safeFetch`(assertSafeUrl + 연결 시점 IP 판정 + 리다이렉트 매 홉 재검증)만 사용, 응답은 *앞 N바이트*만 읽고 크기 상한·타임아웃 적용, 이미지 디코딩 라이브러리 없이 **헤더 바이트로 형식·크기 판정**(PNG/ICO/GIF/JPEG), 원본 미저장(형식·크기·해시만). 04_PROJECT_SPEC M12.
2. **콘텐츠 구조 시그널**: `PageSignals` 확장 후보 — 헤딩 개요(레벨·텍스트, 개수·길이 상한), 질문형 제목 뒤 첫 문단 길이, 아이콘 링크 목록, `og:*` 부속, 수정일. **raw·rendered 양쪽 추출**(R11). 8번 E-E-A-T·3번 Article과 시그널을 공유한다(CHECKPOINT 2026-09-12 §5).

### 기능 — 제안 순서 (위험 낮은 순 · 의존성 반영)
- [ ] **① OG 텍스트 신호 완성** — 네트워크 요청 없음, 위험 최저. `og:type`·`og:image:alt`·`og:site_name`·`og:locale` 추출, `og:url`↔`canonical` 일치 규칙. 이미 있는 값의 복사 fixer만 유지.
- [ ] **② 자산 확인 모듈 → OG 이미지 실측 + 파비콘 규칙** — 홈페이지 `<head>`의 아이콘 링크 누락·형식(SVG 단독 경고)·정사각형·크기·`robots.txt` 차단 여부. 소스 모드에서 `app/` 아이콘 파일이 `<link>`로 노출 안 되는 경우만 승인형 수정.
- [ ] **③ AEO 구조 규칙(보고 전용)** — 제목 위계 건너뜀, 질문형 제목 직후 직답 문단 유무, Q&A 구조화 데이터가 **가시 콘텐츠와 일치**하는지(기존 `R-JSONLD-PRODUCT-NAME-MISMATCH`와 같은 "환각 0" 원칙), 수정일 부재.
- [ ] 단계마다: 픽스처(정상/문제) → 정확도 표 → README 4종·TROUBLESHOOTING 4종·05 표 → plugin 버전 → 번들.

### 영역별 수정(fixer) 가능 범위 — 값 발명 금지 원칙의 적용
| 영역 | 자동 수정 가능 | 보고만(수정 안 함) | 이유 |
|---|---|---|---|
| OG | `og:title`←`title`, `og:url`←`canonical`, (설명은 기존 정책대로 제외) | `og:image`·`og:type`·`og:image:alt` 신규 추가 | 복사할 원본이 페이지에 없다. 이미지를 고르는 순간 값 발명 |
| 파비콘 | 이미 있는 `app/` 아이콘 파일의 `<link>` 노출 | 아이콘 이미지 생성·교체·크기 조정 | 이미지 생성은 값 발명 + 저작권(L3). 표시에 영향이라 승인형 |
| AEO | 없음 | 전부 | 답변·구조를 지어내면 환각·스팸 마크업. FAQPage는 Google 리치결과도 중단됨 |

### 성공기준 — 프로세스 지표 (노출 결과 아님)
- [ ] OG 필수 4종 누락을 각각 정확히 구분하고, `og:type`은 낮은 심각도 + "명세상 미지정이면 website로 간주" 안내를 함께 낸다.
- [ ] 파비콘: 형식·정사각형·크기·크롤 차단을 판정하고, **SVG 단독은 "Google 지원 형식 목록에 없음"** 으로 경고한다(실패 단정 아님).
- [ ] AEO 규칙은 전부 보고 전용이며, 리포트에 "노출 보장" 표현 0 + Google 공식 입장 안내가 있다.
- [ ] **자산 확인이 사설·loopback·메타데이터·IPv6 변형(`[::1]`, `::ffff:7f00:1` 등)·리다이렉트 경유 접근을 모두 거부**한다(테스트로 고정).
- [ ] 이미지·아이콘 원본 저장 0, 제품 동봉 0.

### 위험·변수 — 착수 전 검토
| 위험 | 대응 |
|---|---|
| 값 발명(og:image·type·alt, 아이콘, FAQ 답변) | 위 표의 "보고만". 원본이 페이지에 있을 때만 복사 |
| SSRF 신규 공격면(이미지·아이콘 요청) | 전제 조건의 가드 보강 선행 + M12 + 우회 변형을 테스트로 고정 |
| 저작권·상표(L3·L4) | 이미지는 형식·크기·해시만 보관, 동봉·재배포 0 |
| 휴리스틱 오탐(직답 문단 길이, 질문형 판정) | 임의 임계값 금지 — 공식 근거가 없으면 "권장" 표기 + severity low. 한국어/영어 질문 패턴을 각각 픽스처로 |
| 가이드라인 변경(이번에 FAQ가 실제로 바뀜) | 출처 URL + 확인일을 코드 주석에 남기고 분기별 재확인 |
| **파비콘은 홈페이지에서만 판정**(Google이 홈페이지 헤더를 본다) | 규칙은 사이트 루트 페이지에서만 평가. 하위 URL만 진단하면 "홈 미진단" 안내 |
| 기존 `R-QA-STRUCTURE-MISSING`의 가치 하락 | 규칙은 유지(추가 권장·보장 없음이라는 문구는 여전히 사실). 권고 문구·우선순위 재평가는 사용자 결정(HUMAN_ACTION_CHECKLIST §6) |
| 기존 finding_key 연속성(R1) | 기존 og·qa 규칙은 건드리지 않고 **새 rule_id**로 추가 |

### 통합 테스트
- Phase 1~2 기능과 기존 규칙의 finding_key가 그대로이고, 정확도 표의 기존 규칙 결과가 변하지 않는다.

---

## Phase 3: 다중 엔진·파이프라인·고급 신호 (예상 4주+)

### 전제 조건
- Phase 1~2 운영 중

### 기능
- [ ] 네이버(Yeti·RSS·서치어드바이저)·Bing·IndexNow
- [ ] CI/CD 통합 — 회귀 시 빌드 실패(GitHub Actions)
- [ ] hreflang·다국어 중복 방지
- [ ] 백링크·엔티티(Common Crawl, 상용 API는 옵션·유료)

### 주의사항
- 상용 API 비용 → 옵션. 다중 엔진 규칙 모듈화 유지.

---

## Phase 로드맵 요약

| Phase | 핵심 기능 | 상태 |
|-------|----------|------|
| Phase 1 (MVP) | 분석 엔진 + 회귀 감지 + 리포트 | 시작 전 |
| Phase 1.5 | 수정기(add_safe/gated) + 승인 + 빌드검증·롤백 | Phase 1 완료 후 |
| Phase 2 | 구조화/GEO 기초 + GSC/GA4/PSI 연동 | Phase 1.5 완료 후 |
| Phase 2-B *(요구 등록 2026-10-11)* | AEO·OG·파비콘 확장 (보고 중심 + 승인형 일부) | Phase 2 코어 + **SSRF 가드 보강 병합 후** · 배치 확정 대기 |
| Phase 3 | 네이버·Bing + CI/CD + hreflang + 백링크 | Phase 2 완료 후 |
