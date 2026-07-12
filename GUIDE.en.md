# SeoMedic Beginner's Guide

It's completely fine if this is your first time using a computer, a terminal, or an AI tool. Just follow the steps below one at a time.

This document and its Korean counterpart (**[GUIDE.md](./GUIDE.md)**) contain identical information.

---

## Step 0. Glossary of terms used in this guide

| Term | Simple explanation |
|---|---|
| SEO | Search Engine Optimization — making your page easy for search engines like Google to find |
| GEO | Generative Engine Optimization — making your page likely to be cited in AI answers (ChatGPT, Perplexity, etc.) |
| Crawl | A program automatically visiting web pages and reading their content |
| Render | A browser drawing code (HTML/JavaScript) into what actually appears on screen |
| Canonical | A tag telling search engines "this is the true, representative address for this page" |
| Structured Data (JSON-LD) | A special, hidden markup that helps search engines understand your page content more precisely. It's part of how search results can show extra info like ratings, prices, or reviews |
| Open Graph | Settings that control the preview (title, description, URL) shown when someone shares your page link on social media like Facebook or KakaoTalk |
| Regression | An issue that was previously fixed but has since reappeared |
| MCP | The standard way Claude Code talks to external tools (like the SeoMedic engine) |
| Baseline | A saved snapshot of diagnosis results, used as the reference point for future comparisons |
| Repository (repo) | A space on GitHub, like a folder, holding an entire project's code |
| Branch | A separate "copy" of the code you can work on without touching the original |
| Pull Request (PR) | A proposal saying "how about this change?" sent to a repository's owner/maintainers. It only takes effect once they review and approve it |
| Fork | Copying someone else's repository into your own account (required before you can propose changes to a repository you don't own) |
| Personal Access Token | A limited-permission key you lend to a specific program instead of your real GitHub password |
| Environment variable | A setting value a program reads from your computer (often used to store things like passwords without displaying them on screen) |

---

## Step 1. Confirm the software is installed (~5 minutes)

1. On Windows, open `PowerShell`; on Mac, open `Terminal`.
2. Type the following line by line and press Enter after each:
   ```
   node -v
   ```
   **What success looks like**: a version number like `v22.x.x`. If nothing appears, or you get an error, see [README section 2](./README.en.md#2-prerequisites--required-software) to install Node.js.
3. Confirm Claude Code runs:
   ```
   claude --version
   ```

## Step 2. Install SeoMedic (~3-5 minutes)

1. In the Claude Code chat, type (replace with the real marketplace address):
   ```
   /plugin marketplace add <marketplace-source>
   /plugin install seomedic@<marketplace-name>
   ```
2. **⭐ The single most important step**: once installation finishes, **fully quit** and **relaunch** Claude Code. Closing the window isn't enough — you must actually quit and restart the application.
3. After relaunching, verify:
   ```
   /plugin list
   ```
   **What success looks like**: `seomedic` appears in the list with status "enabled".

## Step 3. Run your first diagnosis (~1-3 minutes)

1. In the chat, type the site address you want to diagnose:
   ```
   /seo-audit https://example.com
   ```
2. The AI may ask "Do you own this site, or do you have permission to audit it?" — confirm if so.
3. On a first run, expect a bit of extra time (1-2 minutes) for automatic browser engine installation.
4. **What success looks like**:
   ```
   ## SEO Diagnostic Report — https://example.com

   **Overall status: Needs Attention** (a reference label only — never an absolute score)

   - Pages diagnosed: 1
   - Total violations: 1

   ## https://example.com/
   HTTP status: `200`

   ### Core Web Vitals (lab measurement)
   | Metric | Value |
   |---|---|
   | LCP | 784ms |
   ...

   ### Violations (ranked by impact)
   | Severity | Rule ID | Category | Current value | Recommended action |
   |---|---|---|---|---|
   | 🟠 high | R-CANONICAL-MISSING | canonical | - | Add a self-canonical tag |
   ```
5. You might also see items related to structured data (JSON-LD) or Open Graph in your report, such as "No structured data found" or "Open Graph title missing." These aren't serious problems — they're marked with "low" severity because they're "opportunities" to make your social sharing or search results richer, not things that are currently broken.

## Step 4. Check again later (regression detection)

1. Once you're happy with (or done reviewing) an audit, ask in the chat:
   ```
   Save this as a baseline
   ```
2. Weeks or months later, after the site has changed, check again:
   ```
   /seo-check https://example.com
   ```
3. **What success looks like**: if nothing regressed, "no regressions found against the baseline"; if something did, a table shows exactly what got worse again.

## Step 5. (Optional) Auto-fix your Next.js project (local folder)

This step only applies if **you have the source code for a Next.js project**. If you only use URL diagnosis, feel free to skip it.

1. First confirm the target project is tracked by git and has no uncommitted changes (clean):
   ```
   git status
   ```
   If it doesn't say `nothing to commit, working tree clean`, commit first.
2. In the Claude Code chat, provide the project folder path:
   ```
   /seo-fix ./your-nextjs-project-folder
   ```
3. The AI shows a plan (what it would fix and how).
   - Purely additive fixes ("add what's missing") proceed automatically.
   - Anything affecting how the site is indexed/displayed shows a diff and asks for your approval — review it and answer "approve" or "reject."
4. Once applied, the AI reports whether `next build` still passes. **If the build fails, it's automatically rolled back** — you don't need to do anything.
5. If you're not happy with the result, ask to "undo the fix I just applied."
6. **Applied fixes are still real file changes** — review with `git diff` as you normally would before committing.

## Step 6. (Optional) Get an auto-fix proposal for a GitHub repository — ⚠️ Experimental

This step only applies if **you have a Next.js project on GitHub and want to receive a Pull Request (proposed change)**. If this is your first time, we recommend getting comfortable with Step 5 (local folder) first. The "your own repository" path of this feature has been fully verified against real GitHub, including an actual generated Pull Request. The flow for forking a repository you don't own and proposing changes has been verified up through fork creation and cloning in a real GitHub environment (we confirmed the fork repository actually gets created). However, the final step of actually creating the Pull Request hasn't been confirmed yet (the test repository used had no Next.js project files, so the process stopped one step before that). Please read the following carefully before proceeding.

1. **Create a GitHub Personal Access Token**
   1. In your browser, go to `https://github.com/settings/personal-access-tokens/new` and log in.
   2. **Repository access**: choose "Only select repositories" → select the target repository from the list.
   3. **Repository permissions**: find and set these two, individually:
      - `Contents` → **Read and write**
      - `Pull requests` → **Read and write**
      - ⚠️ If you select the repository but skip adding these two permissions, it will fail later. Both are required.
   4. Click **Generate token**.
   5. The token value appears in green text **exactly once**. Copy it right now — you can't view it again once you close the page.
2. **⚠️ Never paste this token value into the Claude Code chat.** Register it only on your own computer instead:
   - **Windows**: open a new PowerShell window and type (replace the quoted part with your copied token):
     ```
     setx SEOMEDIC_GITHUB_TOKEN "paste-your-copied-token-here"
     ```
     Success looks like: `SUCCESS: Specified value was saved.`
   - **Mac/Linux**: in your terminal:
     ```
     export SEOMEDIC_GITHUB_TOKEN="paste-your-copied-token-here"
     ```
3. **⭐ The most important step (same reason as right after install)**: **fully quit** and **relaunch** Claude Code. An already-running program has no way to know about a variable you just set.
4. After relaunching, in the Claude Code chat, provide the repository address:
   ```
   /seo-fix https://github.com/owner-name/repo-name
   ```
5. The AI will remind you once more that "this feature is still experimental" before proceeding. Confirm the repository address is correct and that you want to continue.
6. **Unlike local-folder mode, this runs start-to-finish in one shot with no mid-flow approval step**:
   - Safe, purely-additive fixes are applied automatically.
   - Anything affecting how the site is indexed/displayed is never auto-applied — it's only reported as "requires approval, not applied."
7. **What success looks like**: a real GitHub Pull Request link (`https://github.com/.../pull/number`). Click it to see exactly what code changed (the diff).
8. **This isn't the end of the process** — a Pull Request is only a *proposal*. The repository's owner (you, or a teammate) must open it on GitHub, review the content, and click "Merge" for it to actually take effect. SeoMedic never merges automatically.
9. Once you're done using this feature, we recommend deleting (revoking) the token you created at `https://github.com/settings/personal-access-tokens` for security — especially if you didn't set a short expiration when creating it.

## Step 7. Stuck? Look here

- Installation/runtime issues → [TROUBLESHOOTING.en.md](./TROUBLESHOOTING.en.md)
- Questions → [FAQ.en.md](./FAQ.en.md)
- Full feature description → [README.en.md](./README.en.md)

Congratulations — if you've followed along this far, you've used every core feature SeoMedic offers.
