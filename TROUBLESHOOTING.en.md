# Troubleshooting Matrix

Real-world failure scenarios organized as situation → symptom → fix. If this doesn't resolve your issue, please file it as an issue report.

This document and its Korean counterpart (**[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**) contain identical information.

---

### 1. Node.js isn't installed, or the version is too old
- **Symptom**: commands don't run at all; "command not found," or the engine fails to start
- **Fix**: check with `node -v` (22+ required). If missing or too old, install the LTS version from https://nodejs.org, then reopen your terminal and check again.

### 2. Claude Code or the marketplace isn't set up
- **Symptom**: `/plugin marketplace add` itself fails
- **Fix**: confirm Claude Code is up to date (`claude --version`), and double-check the marketplace address (repository URL or local path) is correct.

### 3. Installed, but didn't fully restart (the most common issue)
- **Symptom**: `/plugin install` reports success, but the `/seo-audit` command doesn't show up
- **Fix**: **fully quit and relaunch the Claude Code application itself.** Opening a new chat window is not enough (confirmed by direct testing). After restarting, re-check with `/plugin list` that `seomedic` shows as enabled.

### 4. The Playwright browser (Chromium) isn't installed
- **Symptom**: diagnosis fails with a browser-related error
- **Fix**: run `npx playwright install chromium` directly in a terminal, then retry. On a corporate network/PC, also check item 5 (firewall) below.

### 5. A firewall, proxy, or antivirus is blocking downloads/crawling
- **Symptom**: the install download stalls, or every page fails during diagnosis
- **Fix**: on a corporate network, ask IT to allow access to the npm registry (registry.npmjs.org) and the target site. On a personal PC, check for an antivirus "new program blocked" notification.

### 6. Slow or intermittent internet
- **Symptom**: install/diagnosis appears to hang for a long time
- **Fix**: wait a few more minutes, then retry if it still doesn't complete. The first install downloads Chromium (several hundred MB), which can take a while on a slow connection.

### 7. The Windows path contains non-ASCII characters or spaces
- **Symptom**: file access errors, "path not found" messages
- **Fix**: use an ASCII/numeric-only path for the project folder, or wrap the entire path in double quotes (`"..."`).

### 8. Windows permission issues
- **Symptom**: failure to create the `.seomedic/` folder or write files
- **Fix**: confirm you're running from a personal project folder rather than a folder requiring admin rights (e.g., `C:\Program Files`).

### 9. `/seo-fix` fails to start the local server (e.g., port conflict)
- **Symptom**: `/seo-fix` fails partway through with a "render bridge error"
- **Fix**: another program may be heavily occupying ports (SeoMedic automatically finds a free port each time, so you normally don't need to manually free a specific one). Retry after a moment, or first confirm `npx next build` runs successfully on its own in the target project folder.

### 10. `next build` fails in the `/seo-fix` target project
- **Symptom**: diagnosis itself fails at the plan stage, or the change is automatically rolled back after being applied
- **Fix**: if it fails at the plan stage, first run `npx next build` directly in the target folder to confirm the project builds at all on its own. If it was rolled back after being applied, that is **expected behavior** (a safety mechanism) — read the displayed build error message, fix the underlying cause, and try again.

### 11. Crawling is blocked (robots.txt, 403, bot blocking, rate limiting)
- **Symptom**: diagnosis results are empty, or show "blocked"
- **Fix**: confirm you own the site or have permission. If the target site's `robots.txt` blocks crawling (which may be an intentional protection measure), check with the site's administrator. SeoMedic always respects robots.txt and never bypasses it.

### 12. URL typo, http instead of https, or unexpected redirects
- **Symptom**: diagnosis fails, or an unexpected page gets diagnosed
- **Fix**: confirm the address is entered exactly (including `https://`). If multiple redirects occur, the report will show a "redirect chain" warning.

### 13. Trying to diagnose a site you don't have permission for
- **Symptom**: a warning/confirmation prompt appears before diagnosis runs
- **Fix**: only target sites you own or have explicit permission to test. Before answering "yes" to the confirmation prompt, double-check that you genuinely have permission.

### 14. Git isn't installed, or the working folder is dirty — `/seo-fix` only
- **Symptom**: `/seo-fix` refuses to run with a "git status is not clean" message
- **Fix**: confirm the target project folder is a git repository (`git status`) and has no uncommitted changes. If it does, commit or stash them first, then retry. This is an **intentional safety mechanism** — auto-fix never starts without a safe rollback point. `/seo-audit` (diagnosis only) is unaffected by this restriction and always works.

### 15. Insufficient disk space
- **Symptom**: install failure, Chromium download failure
- **Fix**: free up at least 500MB before retrying.

### 16. Command notation differs by OS (Windows/Mac/Linux)
- **Symptom**: commands in the docs look different from your environment
- **Fix**: commands in this document are OS-agnostic (typed into the Claude Code chat). Terminal commands (like `node -v`) work identically whether typed into Windows PowerShell or a Mac/Linux terminal app.

### 17. GitHub mode — error that `SEOMEDIC_GITHUB_TOKEN` is not set
- **Symptom**: running `/seo-fix https://github.com/...` is immediately refused with a message that the environment variable is missing
- **Fix**: even after creating a token, **it won't be recognized unless you register it on your computer (`setx`/`export`) AND fully restart Claude Code afterward.** This isn't a random bug — it's structural: the SeoMedic engine is a separate program launched alongside Claude Code, and an already-running instance has no way to learn about a variable set afterward. Re-check the token-registration step in `README.en.md` section 5 (GitHub-repository auto-fix proposal).

### 18. GitHub mode — "404 Not Found" even though a token is set
- **Symptom**: even after registering the token and restarting, the target repository can't be found
- **Fix**: this almost always means **the token doesn't actually have access to that repository** (GitHub responds with "not found" rather than "forbidden" for repositories you can't access, to protect privacy). Check, in order:
  1. Open the token at `https://github.com/settings/personal-access-tokens` and confirm the target repository is actually selected under **Repository access**.
  2. Confirm **Repository permissions** has both `Contents` and `Pull requests` set to "Read and write," and that you clicked **Update** in the top-right corner to actually save it (a very common mistake is selecting the repository but forgetting to save the permissions).
  3. Confirm the GitHub account that created the token is either the owner of, or a registered collaborator on, that repository.

### 19. GitHub mode — a Pull Request wasn't created and it says there were zero "add what's missing" items
- **Symptom**: diagnosis succeeds, but zero fixes were auto-applied and no Pull Request was created
- **Fix**: this is not an error — it's **expected behavior**. If there's genuinely nothing that can be safely auto-fixed (e.g., no missing sitemap entries), nothing gets created. Check the "requires approval, not applied" or "suggestion only" list in the result for anything you may want to handle manually.

### 20. GitHub mode — it takes noticeably longer than local mode
- **Symptom**: GitHub mode runs much slower than local-folder mode
- **Fix**: this is expected — GitHub mode clones the entire repository, installs dependencies (`npm install`), and re-verifies the build, on top of everything local mode does. Depending on repository size and your internet speed, this can take considerably longer than local mode.

---

## Still not resolved?
Please file an issue with the exact symptom, the command you ran, and the message shown on screen. A screenshot helps. **Before sharing, please double-check that no GitHub token value appears anywhere in your error message or screenshot.**
