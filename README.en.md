# SeoMedic

> A Claude Code marketplace plugin, installable in any project. Give it a URL and it diagnoses your site's SEO/GEO (Generative Engine Optimization) health.
>
> **Current capabilities: diagnosis + regression detection + approval-gated auto-fix for local Next.js projects + experimental GitHub-repository auto-fix proposals (Pull Requests).** This document only describes what is actually implemented and working today, and clearly flags anything that is implemented but not yet fully verified.

New to computers, terminals, or AI tools? Just follow the steps below in order. This document and its Korean counterpart (**[README.md](./README.md)**) contain identical information — read whichever language you prefer.

---

## Table of Contents
1. [Overview](#1-overview)
2. [Prerequisites & Required Software](#2-prerequisites--required-software)
3. [Download & Install](#3-download--install)
4. [Quick Start (5 minutes)](#4-quick-start-5-minutes)
5. [Running, Using, and How It Works](#5-running-using-and-how-it-works)
6. [Command Reference](#6-command-reference)
7. [Workflow](#7-workflow)
8. [What's New (Update Summary)](#8-whats-new-update-summary)
9. [Security & Data Flow](#9-security--data-flow)
10. [Architecture (Simplified)](#10-architecture-simplified)
11. [File & Document Locations](#11-file--document-locations)
12. [Troubleshooting](#12-troubleshooting)
13. [FAQ](#13-faq)
14. [Legal, Copyright, License, and Commercial Use](#14-legal-copyright-license-and-commercial-use)

---

## 1. Overview

SeoMedic automatically checks whether your site (or a site you have permission to test) is in good shape for Google search and AI-answer search engines (ChatGPT, Perplexity, and similar).

Think of it as a **health checkup for websites**: just as a doctor examines a body and reports "this part needs attention, fix it this way," SeoMedic examines web pages and reports "this part isn't visible enough to search engines, here's how to fix it." And for **Next.js sites**, it can go further and actually apply the fix to your code, with your approval — either in a local folder or in a GitHub repository.

- You can run diagnosis-only checks against any live website (yours or someone else's, **only with permission**).
- It actually opens a real browser (Playwright) to render the page, and compares the raw HTML search engines see against what's actually displayed.
- From the second run onward, it also catches regressions — issues that were previously fixed but silently came back.
- For **Next.js projects**, purely additive fixes ("add what's missing") are applied automatically; changes that affect how the site is indexed or displayed require your explicit approval before being written to disk.
- Beyond local folders, you can also target a **GitHub repository URL** and have the same fix logic run there, submitting the result as a **Pull Request** (experimental — see sections 8 and 14 below).

## 2. Prerequisites & Required Software

| Requirement | Why it's needed | Check command | If missing |
|---|---|---|---|
| **Node.js 22+** | SeoMedic's diagnostic engine is built on Node.js | `node -v` | https://nodejs.org (download the LTS version) |
| **Claude Code** | The program this plugin installs into | `claude --version` | https://claude.com/claude-code |
| **git** | Used for marketplace registration/updates, and required by the local-fix feature (`/seo-fix`) | `git --version` | https://git-scm.com |
| **Internet access** | Needed for installation and live page diagnosis | - | - |
| **~500MB free disk space** | For the automatically-installed Chromium browser engine | - | - |
| (Optional) **GitHub account + Personal Access Token** | Only needed if you use the GitHub-repository auto-fix feature | - | See "GitHub repository procedure" under section 5 below |

> First time running a terminal command? On Windows, open `PowerShell` (search for it in the Start menu); on Mac/Linux, open the `Terminal` app. Type the command exactly as shown and press Enter.

> **What should the check commands show?** `node -v` should print something like `v22.4.0`, `git --version` something like `git version 2.43.0`, and `claude --version` a similar version string — any specific number is fine. If instead you see an **error** such as `'node' is not recognized as an internal or external command` (Windows) or `command not found: node` (Mac/Linux), that program isn't installed yet — use the "If missing" link in the table above, then **open a brand-new terminal window** and try again (a window that was already open won't know about a program you just installed).
>
> **What exactly is Node.js?** It's a tool that lets a computer run programs written in JavaScript, a programming language. SeoMedic's internal diagnostic engine is built with it, so it's required — you'll never need to write any code yourself.

## 3. Download & Install

SeoMedic isn't a separate file you download and run — it's installed **from inside Claude Code itself**, via marketplace commands (Claude Code fetches whatever files it needs automatically).

```
/plugin marketplace add sodam-ai/SoDam-SeoMedic
/plugin install seomedic@sodam-seomedic-marketplace
```

(The two values above are this project's actual GitHub repository address and marketplace name. Copy them exactly as shown.)

**This repository is currently Public on GitHub.** Anyone can use the install command above — no login or special access needed. *(Corrected 2026-08-09: an earlier version of this doc assumed the repo was still Private, but a direct check via `gh repo view` confirmed it is Public — fixing the stale note.)*

**⚠️ You must fully quit and restart Claude Code after installing.** (Confirmed by direct testing: a newly installed plugin is only recognized after a full restart. Opening a new chat tab is not enough — you must quit and relaunch the actual application.)

Verify the install:
```
/plugin list
```
Success looks like: `seomedic` shows up in the list with status "enabled".

## 4. Quick Start (5 minutes)

Type this into the Claude Code chat (replace with the site you want to check):

```
/seo-audit https://example.com
```

- The first run may take 1-2 extra minutes while the Chromium browser engine is installed automatically.
- **What success looks like**: a Markdown report starting with `## SEO 진단 리포트 — https://example.com` (or an English-language equivalent depending on how you phrase your request), listing findings ranked by severity (🔴🟠🟡).
- If nothing is found, it reports "no violations found."

## 5. Running, Using, and How It Works

### `/seo-audit` — Diagnose
```
/seo-audit https://your-site.com
```
Actually opens and renders the page (crawl + render) to check it from a search engine's point of view. **No files are modified.** You'll be asked to confirm you own the site or have permission to audit it before it proceeds.

### Saving a baseline (the reference point for regression comparisons)
After reviewing an audit, ask "save this as a baseline" to trigger `seomedic_save_baseline`. **Baselines are never created automatically** — this is deliberate, so an incorrect state can't accidentally become your reference point.

### `/seo-check` — Check for regressions
```
/seo-check https://your-site.com
```
Compares the current state against your saved baseline and reports anything that used to be fine but has since regressed. If no baseline exists yet, it will guide you to run `/seo-audit` and save one first.

### `/seo-fix` — Auto-fix a local Next.js project
```
/seo-fix ./your-nextjs-project-folder
```
Supports **Next.js projects only** (other frameworks are not yet supported). Flow:

1. **Plan (dry-run)**: briefly starts a local server, diagnoses it, and shows a fix plan without touching any files yet.
   - **Purely additive fixes** (e.g., adding a page missing from the sitemap) are planned automatically.
   - **Changes that affect how the site is indexed or displayed** (canonical tags, robots directives, sitemap structure, etc.) always require your **explicit approval** — the diff is shown first, and you're asked to approve or reject.
2. **Apply**: once approved, the files are actually written, and `next build` is re-run immediately to confirm the build still passes. **If the build fails, the change is automatically rolled back.**
3. **Rollback (if needed)**: ask to "undo the fix" at any time to revert an applied change.

⚠️ **The target must be a git repository with a clean working tree (no uncommitted changes)** — if there's no safe point to roll back to, SeoMedic refuses to start. And **auto-applied fixes are still real file changes** — always review the diff once more before committing/deploying, even for changes labeled "safe."

### `/seo-fix` — GitHub-repository auto-fix proposal (Pull Request) — ⚠️ Experimental

```
/seo-fix https://github.com/owner/repo
```

Instead of a local folder, give it a **GitHub repository URL**. SeoMedic temporarily clones the repository, runs the same diagnose-and-fix logic, and submits the result as a **new branch + Pull Request** (a proposed change). Steps:

1. **Create a GitHub Personal Access Token**
   - Go to `https://github.com/settings/personal-access-tokens/new` and log in.
   - **Repository access**: choose "Only select repositories" → select the target repository.
   - **Repository permissions**: set `Contents` → Read and write, and `Pull requests` → Read and write (both must be added explicitly — selecting the repository alone is not enough).
   - Click **Generate token** and copy the value shown (it's only displayed once).
2. **⚠️ Never paste the token value into the Claude Code chat.** Register it on your own computer instead:
   - Windows (PowerShell): `setx SEOMEDIC_GITHUB_TOKEN "your-copied-token"`
   - Mac/Linux (Terminal, ideally added to your shell profile): `export SEOMEDIC_GITHUB_TOKEN="your-copied-token"`
   - **Fully quit and restart Claude Code afterward** — same reason as after install: an already-running program does not pick up a newly set variable.
3. In the Claude Code chat, run `/seo-fix https://github.com/owner/repo`.
4. **A single call performs the entire flow: diagnose → auto-apply additive fixes → create a Pull Request.** Unlike local-folder mode, there is no interactive approval step mid-flow (this is a structural limitation of a one-shot flow). As a result, **anything that would affect indexing/display is never auto-applied — it's reported as "requires approval, not auto-applied."**
5. If a Pull Request link is returned, **the repository owner must review it and decide whether to merge** — it is never merged automatically.

**Things this feature never does**: push directly to the default branch (main/master), force-push, or auto-merge. It only ever proposes changes via a new branch + Pull Request (there is no force-push capability in the code at all).

> ⚠️ **Honest current status of this experimental feature**: the "your own repository" flow (create branch, apply fix, open Pull Request) has been run against real GitHub and confirmed working. The "fork someone else's repository, then propose via Pull Request" flow has been **partially verified**: creating the fork and cloning it have been confirmed against real GitHub — the forked repository was actually created and confirmed to exist. The final step, actually opening the Pull Request from that fork, has **not yet** been exercised, because the test repository used didn't contain any Next.js project files, so the flow stopped just short of that point (the Pull Request creation logic itself has already been verified in the "your own repository" flow — it just hasn't been run specifically from a forked repository yet). You should know this before using it, and this warning is also shown again at the time you run the command.

## 6. Command Reference

| Command | Description | Notes (can be requested in natural language) |
|---|---|---|
| `/seo-audit <url>` | Diagnose a URL (analysis only) | Site-wide crawl option, max pages (default 200), depth (default 3), requests/sec (default 1) |
| `/seo-check <url>` | Check for regressions against the saved baseline | - |
| `/seo-fix <local-folder>` | Auto-fix a local Next.js project (approval-gated) | Approve/reject via conversation |
| `/seo-fix <GitHub repo URL>` | GitHub-repository auto-fix proposal (PR, experimental) | Requires `SEOMEDIC_GITHUB_TOKEN` environment variable |

> This version uses natural-language requests instead of `--flag` style options (e.g., "run this against the whole site but only 2 levels deep"). No separate CLI executable is included in this version.

## 7. Workflow

```
Get a URL ready
     │
     ▼
Run /seo-audit https://... ──► (diagnosis only, no changes made)
     │                              │
     │                              ▼
     │                     Review the Markdown report
     │                     (findings ranked by severity + Core Web Vitals)
     ▼
Ask to "save this as a baseline"
     │
     ▼
(Later) re-run /seo-check https://...
     │
     ▼
Regression found → warning shown / none found → "no regressions"

(Optional) If you have a Next.js project:
     │
     ▼
/seo-fix ./local-folder   or   /seo-fix https://github.com/owner/repo
     │                                    │
     ▼                                    ▼
Local: review plan → approve/reject →    GitHub: diagnose → auto-apply →
apply → re-verify build → rollback       create Pull Request → owner review
if needed
```

## 8. What's New (Update Summary)

This project deliberately built its highest-risk capability (actually modifying real files) in stages. Click each item to expand it.

<details>
<summary><strong>✅ Phase 1 — URL diagnosis + regression detection (Complete)</strong></summary>

Crawl + render + Core Web Vitals measurement, plus regression detection. Verified end-to-end against a real live site.
</details>

<details>
<summary><strong>✅ Phase 1.5a — Auto-fix for local Next.js projects (Complete, verified by real execution)</strong></summary>

Purely additive fixes ("add what's missing") are applied automatically; changes affecting indexing/display require approval first. Post-apply build re-verification and automatic rollback on build failure have both been confirmed by real execution.
</details>

<details>
<summary><strong>🟡 Phase 1.5b — GitHub-repository auto-fix proposal (Implemented, partially verified)</strong></summary>

The "your own repository" flow (new branch + Pull Request) has been confirmed against real GitHub, including real Pull Request creation. **The "fork a repository you don't own, then propose" flow has been partially verified**: creating the fork and cloning it have been confirmed against real GitHub, but actually opening the Pull Request from the fork has not yet been exercised (the test repository used didn't contain any Next.js project files, so the flow stopped just short of that step). Please review section 14 and the in-app warning before using this.
</details>

<details>
<summary><strong>✅ Phase 2 Stage 1 — Structured Data (JSON-LD) Detection (Done)</strong></summary>

Automatically detects when a page is missing structured data (JSON-LD — a special markup that helps search engines understand your content more precisely) or has malformed JSON-LD, and flags it in the report. **This only detects the issue — it does not auto-generate a fix.** Creating structured-data values from scratch was deliberately left out, since fabricating them carries real risk.
</details>

<details>
<summary><strong>✅ Phase 2 Stage 2 — Open Graph (Social Share Preview) Detection + Partial Auto-fix (Done)</strong></summary>

Checks whether the title and URL shown when a link is shared on social media (Open Graph tags) are missing. Of these, **only the title and url** are auto-filled with your approval — this is safe because they're simply copied from values that already exist on the page. (The description is excluded, since writing one requires generating a new sentence.)
</details>

<details>
<summary><strong>✅ Phase 2 Stage 3 — AI Crawler Policy (GEO) Detection (Done)</strong></summary>

Checks how your `robots.txt` treats the crawlers used by AI search and AI training (11 bots, including GPTBot and ClaudeBot) and reports whether each is allowed or blocked. **This only detects the current state — it does not recommend a policy.** Whether allowing or blocking is the right call is a decision for the site owner, so this reports the facts neutrally, without opinion.
</details>

<details>
<summary><strong>🔧 2026-07-06 — Introduced automated quality CI + fixed real cross-platform bugs</strong></summary>

We added a new automated check that confirms the build and all tests pass on Windows, macOS, and Linux (260 tests as of 2026-07-06; **now 427** as more features were added — see the items below). In the process, we found and fixed several real bugs that had gone unnoticed because development had only ever happened on Windows (for example, the GitHub auto-fix feature failing to locate an internal program path on macOS/Linux). All three operating systems now automatically pass build + test on every change, but **this does not yet include a human manually running the commands on macOS/Linux** — the automated checks reduce this risk, they don't fully eliminate it.
</details>

<details>
<summary><strong>✅ Phase 2 Stage 4 — Content-structure detection (title/H1/image alt text) + Core Web Vitals completed (Done)</strong></summary>

Automatically detects pages with a missing `<title>`, a missing (or duplicated) H1 heading, or images missing alt text (the description used by screen readers and search engines to understand an image). At the same time, the last missing Core Web Vitals (speed) threshold rule — TBT (a responsiveness metric used as a lab-measurable proxy for real INP, which requires an actual user interaction to measure) — was added, completing all three speed metrics (LCP, CLS, TBT). **Detection only — no auto-fix** (these are pure "present or missing" checks rather than value generation, so we judged that a human filling them in is more appropriate than an automated guess).
</details>

<details>
<summary><strong>✅ Phase 2 — Q&A structure + JSON-LD Product required-field validation (Done)</strong></summary>

Checks whether FAQ-style structured data exists (this only checks whether the structure exists in a form that AI search could cite — it **does not guarantee AI-search visibility**). For pages that mark themselves up as a "Product" via JSON-LD, it also checks that the product name and at least one of review/rating/price information are actually present (without these, the page may lose eligibility for rich-result extras like star ratings). **Detection only — no auto-fix.**
</details>

<details>
<summary><strong>✅ Phase 2 — JSON-LD product name vs. actual page content match check ("zero hallucination") (Done)</strong></summary>

Checks whether the product name declared in a page's JSON-LD structured data actually matches text that appears on the rendered page — if the structured data you're telling search engines doesn't match what's actually shown ("hallucination"), search engines can treat this as spam and penalize the page. Price/discount fields were deliberately excluded from this check, since formatting differences (commas, currency symbols) create a high risk of false "mismatch" results on their own; product name is the one field that can be compared safely and deterministically. **Detection only — no auto-fix.**
</details>

**Planned, not yet started**: **real** Google Search Console/Analytics integration (Phase 2 — currently only interface scaffolding and a fake client exist; no real account is connected yet, and this can't start until the user provides real Google service-account credentials); Naver/Bing support (Phase 3). This document only describes what has actually been implemented and verified — planned features are never described as if they already work.

## 9. Security & Data Flow

- **Everything is stored only in the `.seomedic/` folder.** Running a diagnosis creates a single SQLite database file (`.seomedic/seomedic.db`) inside the project folder, holding diagnosis history, baselines, and regression records. This folder is set up to be excluded from git tracking automatically.
- **The database file where results are stored is locked down to owner-only access** (on Mac/Linux — Windows does not support this mechanism the same way due to OS differences, so this is not yet verified on Windows).
- **Raw crawled HTML is never stored in full** — only a hash (fingerprint) and a ≤500-character excerpt are kept (to respect copyright).
- **Zero telemetry.** Nothing is sent anywhere except requests to the URL (or GitHub repository, in GitHub mode) you specify.
- **Private/internal network addresses are never diagnosed** (SSRF protection — `127.0.0.1`, `192.168.x.x`, cloud metadata endpoints, and similar are automatically blocked).
- **`/seo-fix` (local mode) only runs when git is clean, and backs up any file it's about to touch.** Changes affecting indexing/display are never applied without your approval, and a failed post-apply build triggers an immediate automatic rollback.
- **The GitHub token is read only from an environment variable (`SEOMEDIC_GITHUB_TOKEN`).** It is never hardcoded, and the token value itself is never printed in chat, command arguments, logs, or error messages. If the variable isn't set, GitHub mode refuses to run and explains why.
- **GitHub-repository fixes are always proposed via a new branch + Pull Request.** Direct pushes to the default branch, force-pushes, and auto-merge are not implemented in the code at all — they are structurally impossible, not just disabled.
- **Duplicate Pull Requests are avoided** — if an equivalent proposal is already open, a new one is not created.

## 10. Architecture (Simplified)

```
[Claude Code]  ──(you type /seo-audit, /seo-fix, etc.)──►  [SeoMedic plugin]
                                                                    │
                                                        (routes commands to real work)
                                                                    ▼
                                              [SeoMedic diagnostic engine (MCP server)]
                                                                    │
                    ┌───────────────┬────────────────┬─────────────┼───────────────┐
                    ▼               ▼                ▼             ▼               ▼
                Site crawl      Browser render    Performance    Local Next.js   GitHub repo
              (SSRF-protected)  (Playwright)       (Lighthouse)   auto-fix        auto-fix
                    │               │                │          (git-clean check  proposal
                    └───────────────┴────────────────┘           + build re-verify) (experimental:
                                    │                                                clone → fix →
                                    ▼                                                open PR)
                              Results stored (.seomedic/*.db)
```

The plugin (a thin shell) and the diagnostic engine (the actual heavy lifting) are separate — like a TV remote (plugin) and the TV itself (engine): the remote is light, the engine does the real work. GitHub-repository mode has the engine briefly clone the repository into a temporary local folder, run the same fix logic as local mode, then clean up the temporary folder when done.

## 11. File & Document Locations

| What | Where |
|---|---|
| Diagnosis result database | `<your-project>/.seomedic/seomedic.db` |
| GitHub-mode regression history database | Under your home folder, `.seomedic-github-cache/` (kept separately per repository, persists independently of the temporary clone) |
| This plugin's own source | `packages/plugin/` (the installed part), `packages/mcp-engine/` (the engine) |
| GitHub-integration source | `packages/mcp-engine/src/github/` |
| Planning documents (PRD) | `.PRD/` |
| Progress/verification records | `CHECKPOINT.md` (Phase 1), `CHECKPOINT_1.5.md` (Phase 1.5), `CHECKPOINT_2.md` (Phase 2) |
| Security policy | `packages/plugin/SECURITY.md` |
| Disclaimer | `packages/plugin/DISCLAIMER.md` |
| License | `LICENSE`, `THIRD_PARTY_NOTICES.md` |
| Troubleshooting | `TROUBLESHOOTING.md` (Korean), `TROUBLESHOOTING.en.md` (English) |
| FAQ | `FAQ.md` (Korean), `FAQ.en.md` (English) |

## 12. Troubleshooting

See **[TROUBLESHOOTING.en.md](./TROUBLESHOOTING.en.md)** for a full symptom → cause → fix matrix. The three most common issues:

1. **Installed, but `/seo-audit` doesn't show up** → Did you fully quit and restart Claude Code? (a new chat window alone is not enough)
2. **First run takes a long time** → The Chromium browser engine may be installing automatically (a few hundred MB, 1-2 minutes).
3. **"Results are empty"** → The target site may be blocking access via `robots.txt` or a firewall.

## 13. FAQ

See **[FAQ.en.md](./FAQ.en.md)** for frequently asked questions.

## 14. Legal, Copyright, License, and Commercial Use

**Presented strictly, without minimizing or overstating anything.**

### License
- This project intends to adopt the **MIT License** (broadly permits modification, redistribution, and commercial use, provided the copyright notice is preserved). See the `LICENSE` file for the exact text.
- **⚠️ The current `LICENSE` file is a draft with the copyright holder temporarily filled in as "SoDam AI Studio" (2026).** This only settles the factual question of "what name goes here" — **final adoption of the MIT License itself, and this copyright attribution, are still pending formal legal review.** Until this is finalized, the license terms should not be treated as fully in legal effect — always confirm this file has been finalized before commercial distribution or redistribution.
- Third-party open-source dependencies and their licenses are listed in `THIRD_PARTY_NOTICES.md`. A review found **no copyleft licenses (e.g., GPL, which impose source-disclosure obligations on redistribution).**

### What you can do
- Freely install and run diagnostics in personal or company projects.
- Modify and redistribute the source code (once the license above is finalized, subject to its terms).
- Commercial use (once the license is finalized, under MIT terms).

### What you cannot do / must be careful about
- **Diagnosing or modifying a site or repository you don't own or don't have explicit permission for** — legal responsibility rests entirely with the user. SeoMedic is designed to always ask for permission confirmation before proceeding, but it cannot prevent someone from answering that confirmation dishonestly.
- **Using this tool's results as the basis for exaggerated claims** like "guaranteed #1 ranking" or "guaranteed AI-search visibility" — see the no-warranty section below.
- **Collecting or redistributing the full raw text of crawled web pages** — SeoMedic itself is designed to store only a hash and a ≤500-character excerpt, so it cannot be used for this purpose; separately collecting full page content requires its own review of the target site's copyright and terms of service.
- When using the GitHub-repository feature, **creating Pull Requests in bulk without the repository owner's consent** (this may be treated as spam-like behavior).

### No warranty (please read)
- This is a **reference diagnostic tool** and **does not guarantee** search rankings, AI-search visibility, or traffic increases in any way.
- Even changes applied by the auto-fix feature (`add_safe`) are **not guaranteed to be harmless** — always review the diff yourself before committing or deploying.
- See `packages/plugin/DISCLAIMER.md` for the full disclaimer.

### No affiliation
- **This tool has no official affiliation, endorsement, or partnership with Google, Anthropic (Claude), OpenAI (ChatGPT), Perplexity, or any other service named in this document or in diagnostic output.** Names of search engines/AI services are mentioned purely for descriptive purposes.

### Items still pending legal review
- Final confirmation of the copyright holder (see License section above)
- Potential copyright issues in crawled content
- Scope of fair use regarding trademarks (e.g., product names referenced in diagnostics)
- Copyright attribution for AI-generated code/documentation output
- Whether this project's own product name ("SeoMedic") requires trademark registration

⚠️ **None of the above constitutes legal advice.** A professional legal review is strongly recommended before commercial distribution, delivery to clients, or offering this as a service to third parties.

---

This document (README.en.md) contains the complete beginner-friendly, step-by-step walkthrough from install through daily use (the separate GUIDE document was merged into this file as of 2026-08-04 and no longer exists). If something goes wrong, see **[TROUBLESHOOTING.en.md](./TROUBLESHOOTING.en.md)**; for common questions, see **[FAQ.en.md](./FAQ.en.md)**.
