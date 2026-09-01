# SeoMedic — 데이터 모델

> 개정: v2.5 (최종 — 회귀 매칭키·인증 단일화 + GitHub 저장소 target·저장/저작권 보안 반영)
> **대상 프로젝트별 `.seomedic/`(gitignore) 안에 SQLite 저장** — 범용 플러그인이라 프로젝트마다 베이스라인이 분리되어야 함(홈 저장 시 충돌). 회귀 비교의 뼈대는 **안정 매칭키**입니다.

---

## 전체 구조

```
[Project] --1:N--> [AuditRun] --1:N--> [Page]
    |                   |
    |                   └--1:N--> [Finding] --1:N--> [Fix]   (수정 모드에서만)
    |
    └--1:N--> [Baseline] --1:N--> [Regression]
    |
    └--1:N--> [Integration]   (Phase 2, 선택)
```

> **핵심 변경(v1.1)**: Finding에 **finding_key**(안정 매칭키)와 **rule_version** 추가. Regression은 finding.id가 아니라 finding_key로 비교. Fix는 Finding에 **1:N**.

---

## 엔티티 상세

### Project
분석/개선 대상. 남의 사이트(URL) 또는 내 소스 폴더.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 (자동) | prj-001 | O |
| target | URL / 로컬 폴더 / **GitHub 저장소 URL** | https://x.com / ./my-app / github.com/u/repo | O |
| mode | analyze / analyze-fix | analyze-fix | O |
| source_available | 소스 접근 가능 여부(인자·감지 기반) | true | O |
| detected_stack | 감지된 스택. **nextjs만 수정 대상**, 그 외 unknown→report-only | nextjs / unknown | X |
| local_server_cmd | 폴더 모드 렌더용 서버 기동 명령 | `next build && next start` | X |
| created_at | 자동 | 2026-07-02 | O |

### AuditRun
한 번의 감사 실행.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | run-20260702-01 | O |
| project_id | 소속 프로젝트 | prj-001 | O |
| scope | technical / on-page / all | technical | O |
| render_source | 렌더에 쓴 URL(폴더 모드면 로컬 서버 URL) | http://localhost:3000 | X |
| overall_score | 참고용 점수(절대신호 아님, 라벨로만) | 72 | X |
| started_at / finished_at | 자동 | 2026-07-02T10:00 | O |

### Page
크롤·렌더한 페이지.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | pg-0001 | O |
| audit_run_id | 소속 감사 | run-20260702-01 | O |
| url | 페이지 주소 | https://x.com/about | O |
| status_code | HTTP 상태 | 200/301/404 | O |
| raw_has_content | 초기 HTML에 본문/h1/canonical 유무 | true | O |
| rendered_diff | raw↔렌더드 DOM 차이 요약 | "canonical은 JS로만 존재" | X |
| lcp / inp / cls | CWV **중앙값**(3회 측정) | 2.1s/180ms/0.05 | X |

### Finding  ⟵ v1.1 핵심 변경
발견된 개별 문제. **실행 간 동일 문제를 매칭하는 안정 키**를 가짐.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 실행 내부 지역 ID (자동) | fnd-0001 | O |
| **finding_key** | **안정 매칭키 = hash(page_url + rule_id + rule_version)**. 회귀 비교의 기준 | k_a1b2c3 | O |
| audit_run_id | 소속 감사 | run-20260702-01 | O |
| category | indexing/canonical/cwv/meta/schema/geo | canonical | O |
| rule_id | 규칙 식별자 | R-CANONICAL-JS-ONLY | O |
| **rule_version** | 규칙 버전(규칙 바뀌면 베이스라인 무효화 판단) | 1 | O |
| severity | critical/high/medium/low | high | O |
| page_url | 대상 페이지 | https://x.com/about | O |
| current_value / recommended_value | 현재/권장 | "canonical 없음" / "self-canonical 추가" | X |
| status | open / fixed / reverted / **acknowledged**(의도됨) / ignored | open | O |

### Fix  ⟵ v1.1: Finding에 1:N
Finding 하나에 대한 수정. 한 문제가 **여러 파일 수정**을 요구할 수 있어 1:N.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | fix-0001 | O |
| finding_id | 대상 문제 | fnd-0001 | O |
| fix_type | file_edit(로컬) / **pr(GitHub 브랜치+PR)** / report_only | file_edit | O |
| risk_level | **add_safe**(없는 것 추가·자동) / **gated**(색인·표시 영향·승인 필수) | gated | O |
| target_path | 수정 파일 | app/layout.tsx | X |
| dry_run_diff | 적용 전 미리보기(필수) | (diff) | O |
| validation | 적용 전 검증 결과(스키마·빌드) | schema:pass / build:pass | X |
| idempotency_marker | 중복 삽입 방지 마커 | `<!-- seomedic:canonical -->` | X |
| approval_status | pending/approved/rejected/auto | pending | O |
| applied_at | 자동 | 2026-07-02T10:05 | X |

> **safe 경계(확정)**: `add_safe` = "없는 것을 추가"만(빠진 sitemap 항목). **기존 값 덮어쓰기·title/meta/alt·canonical/noindex/robots/sitemap/JSON-LD는 전부 `gated`**. *(2026-08-09 정정: OG 태그는 원안엔 add_safe로 적혔으나 실제로는 title과 같은 이유로 gated 구현됨 — `04_PROJECT_SPEC.md` "safe/gated 경계" 표 참고)*

### Baseline
회귀 비교 기준 스냅샷.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | bl-001 | O |
| project_id | 소속 | prj-001 | O |
| snapshot | 그 시점 finding_key별 상태·지표 | (JSON) | O |
| created_by | auto / user_ack(의도된 변경 승인 시 갱신) | user_ack | O |
| created_at | 자동 | 2026-07-02 | O |

### Regression  ⟵ finding_key 기준
베이스라인 대비 원복 감지.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | reg-001 | O |
| project_id / baseline_id | 비교 대상 | prj-001 / bl-001 | O |
| reverted_keys | 다시 나빠진 **finding_key** 목록 | [k_a1b2c3, k_d4e5f6] | O |
| classification | 각 키를 regression / intended(의도됨) 로 분류 | regression | O |
| detected_at | 자동 | 2026-10-02 | O |

### Integration (Phase 2, 선택)  ⟵ v1.1: 서비스계정 단일화
GSC/GA4 연동. **자격증명은 저장 안 하고 환경변수 경로만 참조.**

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | int-001 | O |
| project_id | 소속 | prj-001 | O |
| type | gsc / ga4 / psi | gsc | O |
| auth_method | **service_account**(권장·단일화) | service_account | O |
| credential_env_ref | 서비스계정 JSON 경로 환경변수 이름 | GSC_SERVICE_ACCOUNT_PATH | O |
| property_scope | **본인 소유·권한 보유 속성만** | https://my-site.com | O |

### github_pr  ⟵ 설계 시점 결정으로 이 문서에 누락돼 있던 엔티티(2026-09-01 뒤늦게 보강)
GitHub 저장소 대상 fix(`Fix.fix_type='pr'`)와 짝을 이루는 최소 필드. `Fix.github_pr_id`가 이 표를
참조한다. 어느 저장소·브랜치에 PR을 냈는지, 중복 PR 방지에 필요한 조회 키만 담는다(구현:
`db/migrations/0003_github_pr.ts`).

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 자동 | 1 | O |
| project_id | 소속 | prj-001 | O |
| repo_owner / repo_name | 대상 저장소 | sodam-ai / SoDam-SeoMedic | O |
| is_fork | fork 저장소 경유 여부 | true | O |
| branch_name | PR 브랜치 | seomedic/fix-review | O |
| pr_number / pr_url | GitHub PR 번호·URL(생성 전엔 null) | 42 / https://github.com/... | X |
| state | open / closed / merged | open | O |
| created_at | 자동 | 2026-09-01 | O |

---

## 왜 이 구조인가

- **회귀가 제품 정체성** → `finding_key`(page_url+rule_id+rule_version)로 실행 간 매칭. **finding.id는 실행 내부 지역 ID라 회귀 비교에 쓰면 안 됨**(v1.1에서 이 결함 수정). *(확인됨 — 리뷰 지적)*
- **의도된 변경 흡수** → `status=acknowledged`, `Regression.classification=intended`, `Baseline.created_by=user_ack`로 "정상 변경을 회귀로 오탐"하는 문제를 처리.
- **안전이 불변식** → 모든 Fix는 `dry_run_diff` 필수. `gated`는 `approval_status=approved` + `validation` 통과여야 적용. `idempotency_marker`로 재실행 중복 방지.
- **인증 단순화** → 로컬 CLI에 OAuth 리다이렉트 서버는 과함 → **서비스계정 JSON(env 경로)로 단일화**. "남의 사이트" GSC는 권한 없으면 못 읽으므로 **본인 소유 속성만**. *(확인됨)*
- **저장 보안(ASVS)** → 도구 자체 SQLite 쿼리는 **파라미터 바인딩**(SQL Injection 방지), DB에 **시크릿·민감 크롤 원본 미저장**(해시/요약만), `.seomedic/` 파일 권한 제한·gitignore. 상세는 04_SPEC "보안 요구사항".
- **저작권(법률 L4)** → 크롤한 **타인 콘텐츠는 재배포·제품 동봉 금지**, 분석 목적 범위만 해시/요약으로. 상세는 04_SPEC "법률·저작권 요구사항".

### 확장성 / 단순성
- Phase 2 구조화/GEO는 `category`에 값(schema/geo) 추가만. 다중 엔진은 규칙셋 모듈 추가.
- 사용자/조직 테이블 없음(로컬 단일 사용자).

---

## 결정 완료 (v2.5)
- [x] `overall_score` → **내부 참고 라벨로만**, 절대점수 표기 금지 (자료: 외부 점수 절대신호 아님)
- [x] 크롤 원본 → **해시·요약 저장**, 원본 전체는 옵션 (프라이버시·디스크)
- [x] Baseline → **사용자 명시 저장**(첫 audit 시 제안), 자동 생성 X (실수 베이스라인 방지)
