# RESEARCH_SOURCES

업로드한 MD 문서에서 정리한 **SEO·Technical SEO·On-page·Off-page·Local SEO·GEO·AEO·LLMO·Structured Data·Schema.org·크롤링·색인·Canonical·Sitemap·robots.txt·E-E-A-T** 분류를 기준으로 삼아 확장 검색했습니다. 또한 대문자 **GEO는 생성형 검색 최적화**, 소문자 `geo`는 위치·Geolocation 기능일 수 있다는 구분도 반영했습니다.

인터넷의 모든 주소를 영구적으로 완전 열거하는 것은 불가능하지만, **2026년 7월 2일 기준 공식 문서·활성 GitHub·Claude Code/Codex 적용성·실무 활용도**를 중심으로 최대한 포괄적으로 정리했습니다.

## 먼저 알아야 할 핵심 결론

```text
SEO = Google·Naver·Bing 등 검색엔진의 검색 노출 기반 최적화

GEO = ChatGPT·Claude·Gemini·Perplexity 등 생성형 AI 답변에서
      브랜드·사이트·콘텐츠가 발견·언급·인용되도록 하는 최적화

AEO = 사용자의 질문에 대해 검색엔진·AI·음성검색이
      직접 제시하는 답변으로 선택될 가능성을 높이는 최적화

LLMO / AI SEO / AI Visibility =
      GEO·AEO와 상당 부분 겹치는 업계 용어

기본 우선순위 =
기술 SEO → 유용하고 신뢰할 수 있는 콘텐츠 → 명확한 엔티티·출처
→ 구조화 데이터 → AI 검색 크롤러 설정 → 측정·검증
```

Google은 AEO와 GEO를 AI 검색 가시성을 위한 업계 용어로 인정하지만, **Google Search 관점에서는 여전히 SEO의 일부**라고 설명합니다. Google AI 검색에 노출되려면 페이지가 먼저 크롤링·색인되고 검색 스니펫 표시 자격을 갖춰야 하며, 특정 “GEO 전용 스키마”는 없습니다. ([Google for Developers](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide?utm_source=chatgpt.com))

------

# 1. Google 공식 SEO·GEO·AEO 핵심 문서

```text
https://developers.google.com/search/docs
https://developers.google.com/search/docs/fundamentals/seo-starter-guide
https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
https://developers.google.com/search/docs/appearance/ai-features
https://developers.google.com/search/docs/fundamentals/creating-helpful-content
https://developers.google.com/search/docs/fundamentals/third-party-seo
https://developers.google.com/search/docs/essentials
https://developers.google.com/search/docs/essentials/technical
https://developers.google.com/search/docs/essentials/spam-policies
```

가장 중요한 주소는 아래 두 개입니다.

```text
SEO 기본:
https://developers.google.com/search/docs/fundamentals/seo-starter-guide

GEO·AEO·Google AI 검색:
https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
```

Google 공식 가이드의 핵심은 별도의 “AI용 꼼수”보다 **명확한 기술 구조, 고유하고 유용한 콘텐츠, 크롤링 가능성, 페이지 경험, 중복 콘텐츠 관리**를 우선하라는 것입니다. ([Google for Developers](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?utm_source=chatgpt.com))

------

# 2. Google Technical SEO 공식 문서

```text
https://developers.google.com/search/docs/crawling-indexing
https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
https://developers.google.com/search/docs/crawling-indexing/robots/intro
https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt
https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
https://developers.google.com/search/docs/crawling-indexing/duplicate-content
https://developers.google.com/search/docs/crawling-indexing/301-redirects
https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget
https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers
https://developers.google.com/search/docs/crawling-indexing/valid-page-metadata
https://developers.google.com/search/docs/crawling-indexing/special-tags
https://developers.google.com/search/docs/crawling-indexing/url-structure
```

## Google 검색 화면·메타데이터·이미지

```text
https://developers.google.com/search/docs/appearance
https://developers.google.com/search/docs/appearance/title-link
https://developers.google.com/search/docs/appearance/snippet
https://developers.google.com/search/docs/appearance/favicon-in-search
https://developers.google.com/search/docs/appearance/google-images
https://developers.google.com/search/docs/appearance/google-discover
https://developers.google.com/search/docs/appearance/site-names
https://developers.google.com/search/docs/appearance/sitelinks
```

------

# 3. 구조화 데이터·Schema.org·Rich Results

```text
https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
https://developers.google.com/search/docs/appearance/structured-data/sd-policies
https://developers.google.com/search/docs/appearance/structured-data/search-gallery
https://developers.google.com/search/docs/appearance/structured-data/article
https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
https://developers.google.com/search/docs/appearance/structured-data/local-business
https://developers.google.com/search/docs/appearance/structured-data/organization
https://developers.google.com/search/docs/appearance/structured-data/product
https://developers.google.com/search/docs/appearance/structured-data/software-app
https://developers.google.com/search/docs/appearance/structured-data/profile-page
https://developers.google.com/search/docs/appearance/structured-data/review-snippet
https://developers.google.com/search/docs/appearance/structured-data/video
https://schema.org/
https://schema.org/docs/documents.html
https://schema.org/docs/schemas.html
https://schema.org/docs/validator.html
https://validator.schema.org/
https://search.google.com/test/rich-results
```

구조화 데이터는 검색엔진이 콘텐츠 유형과 속성을 이해하는 데 도움을 주지만, 올바르게 적용해도 검색 결과나 AI 답변 노출을 보장하지는 않습니다. 네이버 역시 같은 점을 공식 문서에서 명시합니다. ([네이버 서치어드바이저](https://searchadvisor.naver.com/guide/structured-data-intro))

------

# 4. Google Search Console·PageSpeed·Analytics

```text
https://search.google.com/search-console/
https://search.google.com/test/rich-results
https://pagespeed.web.dev/
https://analytics.google.com/
https://merchants.google.com/
https://business.google.com/
```

## API·개발 문서

```text
https://developers.google.com/webmaster-tools
https://developers.google.com/webmaster-tools/v1/api_reference_index
https://developers.google.com/webmaster-tools/v1/searchanalytics/query
https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
https://developers.google.com/speed/docs/insights/v5/get-started
https://developers.google.com/analytics/devguides/reporting/data/v1
https://developers.google.com/analytics/devguides/collection/ga4
https://developers.google.com/merchant/api
```

지역 업체나 전자상거래 사이트라면 Google Business Profile과 Merchant Center 데이터도 일반 검색뿐 아니라 Google의 생성형 AI 응답 가시성에 활용될 수 있습니다. ([Google for Developers](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))

------

# 5. 네이버 SEO 공식 문서

```text
https://searchadvisor.naver.com/
https://searchadvisor.naver.com/guide
https://searchadvisor.naver.com/console
https://searchadvisor.naver.com/guide/seo-help
https://searchadvisor.naver.com/guide/seo-basic-intro
https://searchadvisor.naver.com/guide/seo-basic-robots
https://searchadvisor.naver.com/guide/request-feed
https://searchadvisor.naver.com/guide/structured-data-intro
https://searchadvisor.naver.com/guide/seo-advanced-javascript
https://searchadvisor.naver.com/guide/diagnose-site
https://searchadvisor.naver.com/guide/site-simple-check
https://searchadvisor.naver.com/guide/seo-basic-html
https://searchadvisor.naver.com/guide/seo-basic-make-site
```

네이버는 검색엔진 최적화를 사이트 콘텐츠 정보를 검색엔진이 이해할 수 있도록 정리하는 작업으로 설명하며, 사이트 등록·robots.txt·사이트맵·RSS·고유한 제목·표준 링크·HTML 콘텐츠 제공 등을 권장합니다. ([네이버 서치어드바이저](https://searchadvisor.naver.com/guide))

## 네이버에서 특히 확인할 항목

```text
- 웹마스터 도구 사이트 등록 및 소유 확인
- Yeti 검색로봇 접근 허용
- robots.txt
- sitemap.xml
- RSS
- 제목과 설명
- 표준 HTML 링크
- JavaScript 렌더링
- 구조화 데이터
- 중복 콘텐츠
- noindex / nofollow
```

네이버의 `robots.txt` 문서는 파일을 사이트 루트에서 `text/plain`으로 제공하고, 사이트맵 위치를 함께 기록할 수 있다고 설명합니다. ([네이버 서치어드바이저](https://searchadvisor.naver.com/guide/seo-basic-robots))

------

# 6. Bing·IndexNow·Daum·Yandex

## Bing

```text
https://www.bing.com/webmasters/
https://www.bing.com/webmasters/about
https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
https://www.bing.com/webmasters/help/url-inspection-55a30305
https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed
https://www.bing.com/webmasters/help/robots-txt-30fba23a
```

## IndexNow

```text
https://www.indexnow.org/
https://www.bing.com/indexnow
https://github.com/microsoft/IndexNow
https://www.indexnow.org/documentation
```

IndexNow는 페이지가 새로 생성·수정·삭제됐음을 참여 검색엔진에 빠르게 알리는 방식입니다. 일반 사이트맵을 대체하는 것이 아니라 함께 사용하는 것이 적절합니다.

## Daum·Yandex

```text
https://webmaster.daum.net/
https://webmaster.yandex.com/
https://yandex.com/support/webmaster/
```

------

# 7. ChatGPT·Claude·Perplexity 검색 크롤러 공식 문서

GEO를 적용할 때는 **검색 노출용 크롤러와 AI 학습용 크롤러를 분리해서 판단**해야 합니다.

## OpenAI

```text
https://developers.openai.com/api/docs/bots
https://help.openai.com/ko-kr/articles/12627856-publishers-and-developers-faq
https://openai.com/searchbot.json
https://openai.com/gptbot.json
OAI-SearchBot = ChatGPT 검색 노출용
GPTBot = OpenAI 기반 모델 학습용
ChatGPT-User = 사용자가 요청한 페이지를 방문할 때 사용
```

OpenAI는 `OAI-SearchBot`과 `GPTBot`의 설정이 독립적이므로, 검색 노출은 허용하면서 모델 학습은 차단할 수 있다고 안내합니다. ([OpenAI 개발자](https://developers.openai.com/api/docs/bots?utm_source=chatgpt.com))

## Anthropic

```text
https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
Claude-SearchBot = Claude 검색 품질·검색 색인 관련
Claude-User = 사용자 요청에 따른 페이지 접근
ClaudeBot = 모델 개발·학습 관련
```

Claude 검색 가시성을 원한다면 `Claude-SearchBot`과 `Claude-User` 차단 여부를 별도로 판단해야 합니다. ([Claude Help Center](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler?utm_source=chatgpt.com))

## Perplexity

```text
https://docs.perplexity.ai/docs/resources/perplexity-crawlers
https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt.html
https://www.perplexity.com/perplexitybot.json
https://www.perplexity.com/perplexity-user.json
PerplexityBot = Perplexity 검색 색인·출처 연결
Perplexity-User = 사용자 요청에 따른 페이지 방문
```

Perplexity 공식 문서는 `PerplexityBot`이 검색 결과에 사이트를 표시하기 위한 크롤러이며 기반 모델 학습용은 아니라고 설명합니다. ([Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers?utm_source=chatgpt.com))

------

# 8. Claude Code 전용 SEO·GEO 플러그인

## 가장 직접적인 추천: Claude SEO

```text
https://github.com/AgriciDaniel/claude-seo
https://github.com/AgriciDaniel/claude-seo/blob/main/README.md
https://github.com/AgriciDaniel/claude-seo/blob/main/AGENTS.md
https://github.com/AgriciDaniel/claude-seo/blob/main/SECURITY.md
https://github.com/AgriciDaniel/claude-seo/blob/main/docs/COMMANDS.md
```

Claude Code용으로 기술 SEO, 콘텐츠 품질, E-E-A-T, Schema.org, GEO/AEO, 사이트맵, 이미지, 지역·전자상거래·국제 SEO를 다루는 플러그인입니다. `/seo audit`, `/seo technical`, `/seo schema`, `/seo geo` 같은 명령을 제공합니다. ([GitHub](https://github.com/AgricIDaniel/claude-seo?utm_source=chatgpt.com))

### 공식 README 기준 설치

```text
/plugin marketplace add AgriciDaniel/claude-seo
/plugin install claude-seo@agricidaniel-claude-seo
https://github.com/AgriciDaniel/claude-seo
```

Windows에서는 원격 스크립트를 곧바로 실행하기보다 저장소를 clone하고 설치 파일을 검토하는 방식이 안전합니다. 해당 저장소도 이를 권장합니다. ([GitHub](https://github.com/AgricIDaniel/claude-seo))

------

# 9. Codex 전용 SEO·GEO Skill

## Codex SEO

```text
https://github.com/AgriciDaniel/codex-seo
https://github.com/AgriciDaniel/codex-seo/blob/main/README.md
https://github.com/AgriciDaniel/codex-seo/blob/main/AGENTS.md
https://github.com/AgriciDaniel/codex-seo/blob/main/SECURITY.md
https://github.com/AgriciDaniel/codex-seo/blob/main/CHANGELOG.md
```

Codex용 orchestrator skill, 전문 워크플로, TOML agent profile, 보고서 생성기, Google API·Firecrawl·DataForSEO 확장 구조를 제공합니다. ([GitHub](https://github.com/AgriciDaniel/codex-seo?utm_source=chatgpt.com))

### 검토 후 설치 방식

```text
git clone https://github.com/AgriciDaniel/codex-seo.git
cd codex-seo
powershell -ExecutionPolicy Bypass -File .\install.ps1
https://github.com/AgriciDaniel/codex-seo
```

설치 후 Codex에서 자연어로 요청하거나 다음 형태를 사용할 수 있습니다.

```text
/seo audit https://example.com
/seo technical https://example.com
/seo schema https://example.com
/seo geo https://example.com
```

------

# 10. Claude Code·Codex·Cursor 공통 SEO/GEO Skill

```text
https://github.com/aaron-he-zhu/seo-geo-claude-skills
https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/README.md
https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/SECURITY.md
https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/CONNECTORS.md
```

Claude Code, Codex, Cursor 및 Agent Skills 호환 에이전트에서 사용할 수 있는 SEO·GEO skill 모음입니다. 키워드 조사, 경쟁사 분석, 콘텐츠 작성, 기술 감사, 구조화 데이터, GEO 최적화, 순위·성능 추적을 포함합니다. ([GitHub](https://github.com/aaron-he-zhu/seo-geo-claude-skills?utm_source=chatgpt.com))

### 설치 주소·명령

```text
/plugin marketplace add aaron-he-zhu/seo-geo-claude-skills
/plugin install aaron-seo-geo@aaron
npx skills add aaron-he-zhu/seo-geo-claude-skills
https://github.com/aaron-he-zhu/seo-geo-claude-skills
```

------

# 11. 추가 SEO·GEO·AEO Agent Skills

```text
https://github.com/Bhanunamikaze/Agentic-SEO-Skill
https://github.com/Hainrixz/claude-seo-ai
https://github.com/lionkiii/claude-seo-skills
https://github.com/ChaoticSurfer/seo-skills
https://github.com/Autom8Minds/seo-skills
https://github.com/mverab/eGEOagents
https://github.com/AIcling/agentic_geo
https://github.com/amplifying-ai/awesome-generative-engine-optimization
```

## GitHub 검색 토픽

```text
https://github.com/topics/seo
https://github.com/topics/technical-seo
https://github.com/topics/ai-seo
https://github.com/topics/ai-search-optimization
https://github.com/topics/ai-visibility
https://github.com/topics/generative-engine-optimization
https://github.com/topics/answer-engine-optimization
https://github.com/topics/aeo
https://github.com/topics/llms-txt
https://github.com/topics/schema-org
```

Agentic SEO Skill은 Claude·Codex·Cursor 등에서 실행 가능한 전문 SEO workflow와 자동 수집 스크립트를 제공합니다. 다만 커뮤니티 저장소는 공식 검색엔진 정책과 결과가 다를 수 있으므로, 권고사항을 Google·Naver·Bing 공식 문서로 재검증해야 합니다. ([GitHub](https://github.com/Bhanunamikaze/Agentic-SEO-Skill?utm_source=chatgpt.com))

------

# 12. SEO·GEO·AEO MCP 서버

```text
https://github.com/maxaeo/maxaeo-ai-visibility-mcp
https://github.com/maxaeo/maxaeo-ai-visibility-agent-kit
https://github.com/adityaarsharma/librecrawl-technical-seo-audit-mcp
https://github.com/RichardDillman/seo-audit-mcp
```

## 관련 MCP 검색

```text
https://github.com/topics/seo-mcp
https://github.com/topics/mcp-seo
https://github.com/topics/model-context-protocol
https://github.com/punkpeye/awesome-mcp-servers
https://modelcontextprotocol.io/docs/getting-started/intro
```

### 용도

```text
MaxAEO MCP
- AI 검색 가시성
- GEO/AEO
- AI 크롤러 준비 상태
- Schema·Sitemap·llms.txt 점검

LibreCrawl MCP
- 기술 SEO 크롤링
- 상태 코드·메타데이터
- 내부 링크·구조화 데이터
- 보고서 생성

SEO Audit MCP
- Claude Code/Codex에서 사이트 감사
- 페이지 분석
- 기술 문제 정리
```

MCP 서버는 사이트 URL과 로컬 파일에 접근할 수 있으므로, 설치 전 `package.json`, 실행 스크립트, 네트워크 요청, 환경변수·API 키 처리 방식을 확인해야 합니다.

------

# 13. Next.js 16·React 적용 공식 문서

사용자의 주력 스택인 **Next.js 16·React 19·TypeScript**에서는 서드파티 라이브러리를 먼저 설치하기보다 Next.js의 기본 Metadata API를 우선 쓰는 것이 적절합니다.

```text
https://nextjs.org/docs/app/getting-started/metadata-and-og-images
https://nextjs.org/docs/app/api-reference/functions/generate-metadata
https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
https://nextjs.org/docs/app/api-reference/file-conventions/metadata
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
https://nextjs.org/docs/app/guides/json-ld
```

Next.js는 정적 `metadata`, 동적 `generateMetadata`, `robots.ts`, `sitemap.ts`, Open Graph 이미지 파일 규칙을 기본 제공합니다. JSON-LD는 검색엔진과 AI가 페이지 구조와 엔티티를 이해하도록 돕지만, 외부 문자열을 그대로 삽입할 경우 XSS 방지를 위한 정리가 필요합니다. ([Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots?utm_source=chatgpt.com))

## 선택적 라이브러리

```text
https://github.com/garmeeh/next-seo
https://github.com/iamvishnusankar/next-sitemap
https://www.npmjs.com/package/next-seo
https://www.npmjs.com/package/next-sitemap
https://www.npmjs.com/package/schema-dts
권장:
Next.js 16 App Router 신규 프로젝트
→ Next.js 기본 Metadata API 우선

선택:
기존 프로젝트·복잡한 레거시 구성
→ next-seo / next-sitemap 검토
```

------

# 14. 사이트 감사·성능·링크 검사 오픈소스 도구

## Lighthouse·Core Web Vitals

```text
https://github.com/GoogleChrome/lighthouse
https://developer.chrome.com/docs/lighthouse/overview
https://pagespeed.web.dev/
https://github.com/GoogleChrome/lighthouse-ci
https://github.com/treosh/lighthouse-ci-action
```

## 전체 사이트 Lighthouse 검사

```text
https://github.com/harlan-zw/unlighthouse
https://unlighthouse.dev/
```

## 크롤러·종합 감사

```text
https://github.com/janreges/siteone-crawler
https://github.com/adityaarsharma/librecrawl-technical-seo-audit-mcp
```

## 깨진 링크 검사

```text
https://github.com/JustinBeckwith/linkinator
https://github.com/lycheeverse/lychee
https://github.com/stevenvachon/broken-link-checker
```

## HTML·접근성·품질

```text
https://validator.w3.org/
https://jigsaw.w3.org/css-validator/
https://github.com/pa11y/pa11y
https://www.deque.com/axe/
https://github.com/dequelabs/axe-core
```

Claude Code·Codex에 이런 CLI 도구를 연결하면 코드 변경 후 **Lighthouse → 링크 검사 → HTML/접근성 검사 → 구조화 데이터 검사**를 반복하는 검증 루프를 만들 수 있습니다.

------

# 15. 상용·외부 SEO 감사 도구

```text
https://www.screamingfrog.co.uk/seo-spider/
https://ahrefs.com/site-audit
https://www.semrush.com/siteaudit/
https://sitebulb.com/
https://www.seoptimer.com/
https://sitechecker.pro/seo-site-audit/
https://www.similarweb.com/corp/search/site-audit/
https://seositecheckup.com/
https://www.seranking.com/website-audit.html
https://moz.com/products/pro/site-crawl
키워드·백링크·경쟁사:
https://ahrefs.com/
https://www.semrush.com/
https://moz.com/
https://seranking.com/
https://dataforseo.com/

콘텐츠·엔티티:
https://www.surferseo.com/
https://www.clearscope.io/
https://marketmuse.com/
https://www.frase.io/
```

외부 도구의 “SEO 점수”나 “AI 가시성 점수”는 각 업체의 자체 모델이므로 절대적 순위 신호로 보면 안 됩니다. 공식 검색엔진 데이터와 실제 크롤링·트래픽·전환 자료로 교차 검증해야 합니다.

------

# 16. GEO·AEO·AI Visibility 전문 자료 모음

```text
https://github.com/amplifying-ai/awesome-generative-engine-optimization
https://github.com/mverab/eGEOagents
https://github.com/AIcling/agentic_geo
https://github.com/maxaeo/maxaeo-ai-visibility-agent-kit
https://github.com/maxaeo/maxaeo-ai-visibility-mcp
```

## 검색용 GitHub 주소

```text
https://github.com/search?q=%22generative+engine+optimization%22&type=repositories
https://github.com/search?q=%22answer+engine+optimization%22&type=repositories
https://github.com/search?q=%22AI+visibility%22+SEO&type=repositories
https://github.com/search?q=GEO+AEO+Claude+Code&type=repositories
https://github.com/search?q=SEO+Codex+skill&type=repositories
```

------

# 17. GEO·AEO 연구 논문

## GEO 최초 대표 연구

```text
https://arxiv.org/abs/2311.09735
https://arxiv.org/pdf/2311.09735
```

이 연구는 Generative Engine Optimization이라는 개념과 GEO-bench를 제시했으며, 실험 환경에서 인용·통계·권위 있는 표현 등의 변경이 생성형 응답 내 가시성을 개선할 수 있다고 보고했습니다. 다만 이는 모든 실제 서비스에서 동일한 결과를 보장하는 공식 순위 공식은 아닙니다. ([arXiv](https://arxiv.org/pdf/2311.09735?utm_source=chatgpt.com))

## Agentic GEO

```text
https://arxiv.org/abs/2603.20213
https://github.com/AIcling/agentic_geo
```

## 추가 연구

```text
https://arxiv.org/abs/2511.20867
https://arxiv.org/abs/2509.08919
https://arxiv.org/abs/2601.16858
https://arxiv.org/abs/2604.07585
https://arxiv.org/abs/2606.04362
https://arxiv.org/abs/2606.12439
https://arxiv.org/abs/2606.20065
```

최근 연구들은 AI 답변이 같은 질문에서도 실행마다 달라질 수 있으며, 플랫폼 자체 성장과 실제 AEO 효과를 구분해야 한다고 지적합니다. 한 자연실험 연구도 AEO 개입 효과가 시사되지만 확정적이지 않다고 결론지었습니다. ([arXiv](https://arxiv.org/pdf/2604.07585?utm_source=chatgpt.com))

------

# 18. `llms.txt` 관련 주소

```text
https://github.com/AnswerDotAI/llms-txt
https://llmstxt.org/
https://github.com/thedaviddias/llms-txt-hub
https://github.com/aircodelabs/llms-txt-generator
https://github.com/apify/actor-llmstxt-generator
https://github.com/marketplace/actions/llms-txt-action
https://github.com/topics/llms-txt
```

## 중요한 주의점

```text
llms.txt는 제안된 비공식 형식이다.

Google Search는 llms.txt를 사용하지 않는다.

Google 검색·AI 검색 순위에 도움을 주는 특별한 파일이 아니다.

다른 에이전트·문서 소비 시스템을 위한 선택적 파일로는 사용할 수 있다.
```

Google은 2026년 6월 29일 갱신된 공식 가이드에서 `llms.txt`와 별도의 AI 전용 마크업을 Google Search가 사용하지 않으며, 이를 만들어도 Google 검색 가시성에는 도움도 손해도 주지 않는다고 명확히 설명합니다. ([Google for Developers](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))

------

# 19. Local SEO·전자상거래 SEO

## Google Business Profile·Merchant Center

```text
https://business.google.com/
https://support.google.com/business/
https://merchants.google.com/
https://support.google.com/merchants/
https://developers.google.com/search/docs/appearance/structured-data/local-business
https://developers.google.com/search/docs/appearance/structured-data/product
https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
```

## 네이버 지역·업체

```text
https://smartplace.naver.com/
https://new.smartplace.naver.com/
https://searchadvisor.naver.com/
```

## 기본 확인 항목

```text
- 업체명·주소·전화번호의 일관성
- 공식 사이트와 지도·업체 프로필 연결
- 영업시간·서비스 지역·가격·제품 정보
- LocalBusiness / Organization / Product JSON-LD
- 실제 고객 리뷰와 답변
- 지역별 별도 콘텐츠의 중복 방지
- 모바일 사용성과 길찾기·전화·문의 전환
```

------

# 20. Claude Code·Codex 프로젝트에서 관리할 파일

```text
app/layout.tsx
app/page.tsx
app/robots.ts
app/sitemap.ts
app/opengraph-image.tsx
app/twitter-image.tsx

components/json-ld.tsx
lib/seo.ts
lib/schema.ts

public/robots.txt
public/sitemap.xml
public/favicon.ico
public/manifest.webmanifest
public/llms.txt            # 선택 사항

AGENTS.md
CLAUDE.md
skills/seo/SKILL.md

docs/seo-checklist.md
docs/content-guidelines.md
docs/entity-profile.md
docs/ai-crawler-policy.md

scripts/seo-audit.ts
scripts/check-links.ts
scripts/generate-sitemap.ts

.github/workflows/seo-audit.yml
.github/workflows/lighthouse.yml
.github/workflows/link-check.yml
```

## `AGENTS.md` 또는 `CLAUDE.md`에 넣을 규칙

```text
- Google, Naver, Bing 공식 문서를 우선 근거로 사용한다.
- 순위나 AI 인용을 보장하지 않는다.
- robots.txt, canonical, sitemap 변경 전 현재 설정을 확인한다.
- noindex, nofollow, canonical 변경은 명시적 승인 후 적용한다.
- JSON-LD 내용은 실제 페이지 콘텐츠와 일치해야 한다.
- 존재하지 않는 리뷰·통계·경력·인용을 생성하지 않는다.
- 대량 AI 페이지 생성 전에 중복·얇은 콘텐츠 위험을 검사한다.
- 변경 후 Lighthouse, 링크 검사, Rich Results Test를 실행한다.
- 변경 전후 Search Console·Bing·Naver 성과를 비교한다.
```

------

# 21. 사용자 스택 기준 추천 구성

사용자의 **Next.js 16·React 19·TypeScript·Tailwind CSS 4** 기준으로는 아래 구성이 가장 현실적입니다.

```text
1. 기본 구현
Next.js Metadata API
robots.ts
sitemap.ts
generateMetadata
JSON-LD
Open Graph 이미지

2. Claude Code
https://github.com/AgriciDaniel/claude-seo

3. Codex
https://github.com/AgriciDaniel/codex-seo

4. Claude·Codex 공통 Skill
https://github.com/aaron-he-zhu/seo-geo-claude-skills

5. AI 가시성 MCP
https://github.com/maxaeo/maxaeo-ai-visibility-mcp

6. 기술 크롤링
https://github.com/adityaarsharma/librecrawl-technical-seo-audit-mcp
https://github.com/janreges/siteone-crawler

7. 자동 검증
https://github.com/GoogleChrome/lighthouse-ci
https://github.com/harlan-zw/unlighthouse
https://github.com/JustinBeckwith/linkinator
https://github.com/lycheeverse/lychee

8. 성과 확인
Google Search Console
Bing Webmaster Tools
Naver Search Advisor
GA4

9. 선택 사항
llms.txt
IndexNow
상용 키워드·백링크 API
```

------

# 22. 추천 우선순위

```text
1순위: 공식 Technical SEO
- 색인 가능
- robots.txt
- sitemap
- canonical
- status code
- JavaScript 렌더링
- 속도·모바일

2순위: 콘텐츠와 엔티티
- 명확한 주제
- 실제 경험
- 전문성·근거
- 작성자·회사 정보
- 날짜·출처
- 중복 없는 고유 정보

3순위: 구조화
- 제목·설명
- heading
- 내부 링크
- JSON-LD
- Organization / Article / Product / LocalBusiness

4순위: GEO·AEO
- 질문에 바로 답하는 문장
- 검증 가능한 수치와 출처
- 브랜드·제품·서비스 명칭 일관성
- 인용 가능한 원본 자료
- 검색 크롤러 접근 정책

5순위: 측정
- 검색 노출
- 클릭
- AI 추천·인용
- referral traffic
- 전환
- 여러 번 반복 측정
```

------

# 23. 주의·제외해야 할 방식

```text
- “GEO 설정만 하면 ChatGPT 1위” 같은 보장
- 대량의 얇은 AI 콘텐츠 자동 생성
- 가짜 후기·가짜 통계·가짜 인용
- 의미 없이 FAQ를 반복 생성
- 모든 페이지에 동일한 JSON-LD 삽입
- 운영 사이트의 canonical/noindex를 자동 변경
- 검색 크롤러와 AI 학습 크롤러를 구분하지 않고 모두 차단
- llms.txt를 공식 Google 순위 요소라고 주장
- 비공식 플러그인의 설치 스크립트를 검토 없이 실행
- 외부 MCP에 Search Console·GA4 비밀 키를 무분별하게 전달
```

Google은 대량 페이지 생성, AI만을 위한 재작성, 가짜 외부 언급, 과도한 구조화 데이터, `llms.txt`를 이용한 “AI 검색 해킹”보다 사람에게 유용하고 신뢰할 수 있는 콘텐츠를 우선하라고 안내합니다. ([Google for Developers](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))

------

# 최종 핵심 주소만 압축

```text
# Google 공식
https://developers.google.com/search/docs
https://developers.google.com/search/docs/fundamentals/seo-starter-guide
https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
https://search.google.com/search-console/
https://search.google.com/test/rich-results
https://pagespeed.web.dev/

# 네이버·Bing
https://searchadvisor.naver.com/guide
https://www.bing.com/webmasters/
https://www.indexnow.org/

# AI 검색 크롤러
https://developers.openai.com/api/docs/bots
https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
https://docs.perplexity.ai/docs/resources/perplexity-crawlers

# Claude Code
https://github.com/AgriciDaniel/claude-seo

# Codex
https://github.com/AgriciDaniel/codex-seo

# Claude·Codex 공통
https://github.com/aaron-he-zhu/seo-geo-claude-skills

# MCP
https://github.com/maxaeo/maxaeo-ai-visibility-mcp
https://github.com/adityaarsharma/librecrawl-technical-seo-audit-mcp
https://github.com/RichardDillman/seo-audit-mcp

# Next.js 16
https://nextjs.org/docs/app/getting-started/metadata-and-og-images
https://nextjs.org/docs/app/api-reference/functions/generate-metadata
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
https://nextjs.org/docs/app/guides/json-ld

# 검사 도구
https://github.com/GoogleChrome/lighthouse
https://github.com/harlan-zw/unlighthouse
https://github.com/janreges/siteone-crawler
https://github.com/JustinBeckwith/linkinator
https://github.com/lycheeverse/lychee

# GEO 연구
https://arxiv.org/abs/2311.09735
https://arxiv.org/abs/2603.20213
https://github.com/AIcling/agentic_geo
https://arxiv.org/abs/2606.04362

# llms.txt
https://github.com/AnswerDotAI/llms-txt
https://llmstxt.org/
```

# 10번 검증 결과

1. **업로드 MD 반영**: 문서의 SEO·GEO·AEO·LLMO·Technical SEO·Structured Data 분류를 기준으로 확장했습니다.
2. **용어 혼동 방지**: 생성형 검색 최적화 `GEO`와 위치 정보 `geo`를 구분했습니다.
3. **공식 자료 우선**: Google·Naver·Bing·OpenAI·Anthropic·Perplexity·Next.js 공식 문서를 먼저 배치했습니다.
4. **Claude Code 적용 확인**: 설치 가능한 `claude-seo` 플러그인과 명령어·보안 문서를 포함했습니다.
5. **Codex 적용 확인**: Codex 전용 skill·agent·설치 자료인 `codex-seo`를 포함했습니다.
6. **공통 적용 확인**: Claude Code·Codex·Cursor 등에서 쓸 수 있는 Agent Skills와 MCP를 포함했습니다.
7. **개발 적용 확인**: Next.js 16 Metadata API, robots, sitemap, JSON-LD, OG 이미지 공식 문서를 포함했습니다.
8. **검증 도구 포함**: Lighthouse, Unlighthouse, SiteOne, Linkinator, Lychee, Rich Results Test를 포함했습니다.
9. **과장·오류 방지**: `llms.txt`가 Google 순위 요소가 아니라는 최신 공식 안내와 GEO/AEO 효과가 확정적이지 않다는 연구를 반영했습니다.
10. **복사 편의성 확인**: 사이트·GitHub·문서·연구·도구 주소를 카테고리별 코드블럭과 최종 압축 목록으로 정리했습니다.
