# Frequently Asked Questions (FAQ)

This document and its Korean counterpart (**[FAQ.md](./FAQ.md)**) contain identical information.

### Q. Does SeoMedic improve my search ranking?
No. SeoMedic is a **diagnostic tool**. It finds and reports problems, but does not guarantee search rankings or AI-search visibility. No tool can honestly "guarantee" rankings.

### Q. Can I diagnose a site I don't own?
Technically yes, but you should **only target sites you own or have explicit permission to test.** Crawling third-party sites without authorization can create legal exposure.

### Q. Does it actually fix the code while diagnosing?
**Yes, for Next.js projects.** You can target either a local folder (`/seo-fix ./your-project-folder`) or a GitHub repository URL (`/seo-fix https://github.com/owner/repo`). Purely additive fixes are applied automatically; changes affecting how the site is indexed/displayed only go into effect after your approval. Other frameworks (React, Vue, etc.) are not yet supported.

### Q. Is the GitHub-repository auto-fix (PR mode) safe?
The safety mechanisms have been verified through real execution — there is no direct-push-to-default-branch, force-push, or auto-merge capability in the code at all, and anything requiring approval is never auto-applied. However, **the "fork a repository you don't own, then propose via PR" path has not yet been verified against real GitHub** (only the "your own repository" path — creating a branch and PR directly — has been confirmed working against real GitHub). See `CHECKPOINT_1.5.md` for details.

### Q. Why does GitHub mode need a token? Can't I just use my password?
Using your real GitHub password would give the program access to everything in your account. A Personal Access Token is a much safer alternative — it can be scoped to "only this one repository, only these specific actions (read/write code, create PRs)."See Step 6 of `GUIDE.en.md` for exact instructions on creating one.

### Q. Can I paste my GitHub token into the chat?
**Absolutely not.** Chat conversations are logged, so the moment a token is typed even once, it must be treated as compromised. Always register it only as an environment variable (`SEOMEDIC_GITHUB_TOKEN`) on your own computer. If you accidentally paste it, immediately revoke that token on GitHub and generate a new one.

### Q. Why doesn't `overall_score` show up as a number?
This is intentional. An SEO "score" is just one tool's own calculation and can diverge from a real search engine's actual judgment, so instead of an absolute number like "72," results are shown only as reference labels like "Good / Needs Attention / At Risk."

### Q. The Core Web Vitals numbers differ from what actually affects my Google ranking — why?
That's expected. The numbers SeoMedic shows are **lab data** (measured locally, 3 runs), while Google's actual ranking signal uses **field data** (CrUX — real visitor data). These two are naturally expected to differ.

### Q. Is my personal data or crawled site content sent anywhere?
No. There is zero telemetry. All data stays inside the `.seomedic/` folder in the project where you ran the diagnosis (and, for GitHub mode, also `.seomedic-github-cache/` under your home folder).

### Q. Does it store the full text of crawled pages?
No. It never stores the full raw page text — only a hash (fingerprint) and a ≤500-character excerpt (to respect copyright).

### Q. Can I use it across multiple projects?
Yes. Install it once and use it from any project. The diagnosis result database, however, is **kept separately per project folder**.

### Q. Is it free?
Yes, SeoMedic itself is free and runs locally with no credits or billing. Your separate Claude Code usage costs still apply, of course.

### Q. Can it diagnose frameworks other than Next.js (React, Vue, etc.)?
Yes — **URL-based diagnosis works for any stack.** Auto-fix (`/seo-fix`, both local and GitHub modes), however, currently only supports Next.js projects; other stacks only receive "here's how you could fix this" suggestions.

### Q. If I don't like a fix `/seo-fix` applied, can I undo it?
**In local-folder mode**, yes — ask to "undo the fix I just applied" and it restores from the backup made at apply time. If `next build` fails immediately after applying, it's automatically rolled back even without you asking. **In GitHub mode**, the result only ever exists as a Pull Request (a proposal), so if you don't like it, just close that PR — the default branch was never touched in the first place.

### Q. What happens if I never approve a gated fix?
Nothing happens — the item simply stays un-applied until you approve or reject it. GitHub mode has no interactive approval step at all (structurally impossible in a one-shot flow), so any such item is never auto-applied; it's only reported as "requires approval, not applied."

### Q. Does a Pull Request get merged automatically once created?
No, never automatically. A Pull Request is only ever a proposal — the repository owner must review it themselves and decide whether to merge.

### Q. Does it support Naver or Bing?
Currently it's Google-focused. Naver/Bing support is planned for a future version (Phase 3).

### Q. How does regression detection work?
The same issue (same rule) on the same page is matched using a stable key. If an issue that wasn't present when the baseline was saved shows up again in a later diagnosis, it's flagged as a "regression." If you mark an intentional change as "acknowledged," it won't be flagged again afterward.

### Q. Can I use this commercially (company projects, client delivery, etc.)?
Once the license is finalized (MIT is intended), commercial use will be permitted under its terms. Right now, the `LICENSE` file is a draft with the copyright holder temporarily filled in as "SoDam AI Studio" — final adoption of MIT itself, and this attribution, are still pending formal legal review. Before any commercial distribution, please confirm section 14 of the README and the `LICENSE` file have been finalized, and consult a legal professional if needed. This FAQ is not legal advice.
