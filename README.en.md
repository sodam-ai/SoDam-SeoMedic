# SeoMedic

> A Claude Code marketplace plugin, installable in any project. Give it a URL and it diagnoses your site's SEO/GEO (Generative Engine Optimization) health.
>
> **Current version (Phase 1) capabilities: diagnosis + regression detection only.** Automatic source-code fixing (Phase 1.5) is not yet implemented.

## 1. Overview
SeoMedic crawls and renders a live URL (via headless Chromium), compares the raw HTML search engines see against the fully-rendered DOM, measures Core Web Vitals, and reports prioritized issues. On repeat runs, it detects regressions — issues that were fixed before but silently came back.

## 2. Prerequisites
- Node.js 22+ (`node -v`)
- Claude Code (`claude --version`)
- git
- Internet access (installation + live diagnosis)
- ~500MB free disk space (Chromium browser binary)

## 3. Install
```
/plugin marketplace add <marketplace-source>
/plugin install seomedic@<marketplace-name>
```
**Important**: Fully restart Claude Code (quit and relaunch the app, not just a new chat) after installing — this is a confirmed requirement, not optional.

Verify with `/plugin list` — `seomedic` should show as enabled.

## 4. Quick Start (5 minutes)
```
/seo-audit https://example.com
```
First run may take 1-2 extra minutes for automatic Chromium browser installation. You'll get a Markdown report with severity-ranked findings.

## 5. Usage
- `/seo-audit <url>` — diagnose a URL. Analysis only; no files are modified. You'll be asked to confirm you own or have permission to audit the target.
- Ask to "save this as a baseline" after reviewing an audit — baselines are never created automatically.
- `/seo-check <url>` — compare current state against the saved baseline; reports regressions.
- `/seo-fix` — not yet implemented (planned for Phase 1.5).

## 6. Command Reference
| Command | Description |
|---|---|
| `/seo-audit <url>` | Diagnose a URL (single-page by default; site-wide crawl available via natural-language request) |
| `/seo-check <url>` | Check for regressions against the saved baseline |
| `/seo-fix` | Not implemented yet |

## 7. Workflow
```
Prepare a URL → /seo-audit → review Markdown report → ask to save baseline
      → (later) /seo-check → regression found? warn : "no regressions"
```

## 8. Security & Data Flow
- All data lives in `.seomedic/` inside the project directory the command was run from (SQLite file), never centrally.
- Raw crawled HTML is never stored in full — only a hash and a ≤500-character excerpt.
- Zero telemetry — nothing is sent anywhere except requests to the URL you specify.
- SSRF protection: private/loopback/link-local/cloud-metadata IPs are blocked automatically.

## 9. Architecture
```
Claude Code → SeoMedic plugin (thin) → SeoMedic MCP engine (crawler + Playwright renderer + Lighthouse + SQLite)
```

## 10. File Locations
- Diagnosis database: `<your-project>/.seomedic/seomedic.db`
- Plugin source: `packages/plugin/`; engine source: `packages/mcp-engine/`
- Security policy: `packages/plugin/SECURITY.md`; disclaimer: `packages/plugin/DISCLAIMER.md`

## 11. Troubleshooting
See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for a full symptom→cause→fix matrix. Most common issue: forgetting to fully restart Claude Code after install.

## 12. FAQ
See [FAQ.md](./FAQ.md).

## 13. Legal, License, and Commercial Use
- **License**: MIT recommended (permits modification, redistribution, and commercial use with attribution) — **final copyright holder/year confirmation is pending legal review**. See `LICENSE`.
- No warranty: SeoMedic does not guarantee search rankings or AI-search visibility. See `packages/plugin/DISCLAIMER.md`.
- Not affiliated with Google, Claude, ChatGPT, or any other named service/tool referenced in this tool's diagnostics.
- Only audit sites you own or have explicit permission to test.
- This is not legal advice — consult a professional before commercial distribution.
