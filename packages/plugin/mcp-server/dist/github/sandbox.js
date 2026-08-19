import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runGitCommand } from "./git-exec.js";
export class SandboxError extends Error {
}
const SANDBOX_PREFIX = "seomedic-github-sandbox-";
const DEFAULT_MAX_REPO_SIZE_KB = 512_000; // 500MB — 계획 단계엔 없던 상한, 설계 검토 중 추가
const DEFAULT_CLONE_TIMEOUT_MS = 5 * 60_000;
const ORPHAN_MAX_AGE_MS = 60 * 60_000; // 1시간 넘은 sandbox 잔해만 GC 대상(현재 실행 중인 것과 혼동 방지)
const activeSandboxes = new Set();
let exitHandlerRegistered = false;
/**
 * Windows에서 방금 종료한 자식 프로세스(next build/npm install 등)가 파일 핸들을 완전히 놓기 전에
 * rmdir을 시도하면 `EBUSY: resource busy or locked`로 실패한다(실제로 CI windows-latest에서 재현된
 * 문제 — gated fixer가 여러 개로 늘어나 sandbox 하나에서 next build를 여러 번 도는 시나리오가 생기며
 * 처음 드러났다). Node 공식 문서가 바로 이 문제를 위해 제공하는 재시도 옵션을 그대로 쓴다(직접
 * 재시도 루프를 짜지 않음 — 이미 검증된 표준 메커니즘).
 */
const RM_RETRY_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 300 };
function registerExitCleanup() {
    if (exitHandlerRegistered)
        return;
    exitHandlerRegistered = true;
    const cleanupAll = () => {
        for (const dir of activeSandboxes) {
            try {
                fs.rmSync(dir, RM_RETRY_OPTIONS);
            }
            catch {
                // 프로세스 종료 경로라 실패해도 할 수 있는 게 없음 — 다음 기동 시 GC가 정리
            }
        }
    };
    process.on("exit", cleanupAll);
    process.on("SIGINT", () => {
        cleanupAll();
        process.exit(130);
    });
    process.on("SIGTERM", () => {
        cleanupAll();
        process.exit(143);
    });
}
/**
 * 서버 기동 시 1회 호출 — 이전 실행이 비정상 종료(강제 kill 등)해 signal 핸들러조차 못 돌고 남은
 * sandbox 잔해를 정리한다(계획 단계의 "3중 정리: finally/signal handler/기동시 GC" 중 마지막 층).
 * 1시간 미만인 디렉터리는 건드리지 않는다 — 동시에 다른 프로세스가 실제로 쓰고 있을 수 있어서다.
 */
export function gcOrphanedSandboxes() {
    const tmpDir = os.tmpdir();
    let entries;
    try {
        entries = fs.readdirSync(tmpDir);
    }
    catch {
        return;
    }
    const now = Date.now();
    for (const entry of entries) {
        if (!entry.startsWith(SANDBOX_PREFIX))
            continue;
        const fullPath = path.join(tmpDir, entry);
        try {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > ORPHAN_MAX_AGE_MS) {
                fs.rmSync(fullPath, RM_RETRY_OPTIONS);
            }
        }
        catch {
            // 이미 없어졌거나 접근 불가 — 무시하고 다음 항목 계속
        }
    }
}
/**
 * 얕은 clone(`--depth 1`)만 한다 — 계획 단계엔 없던 결정. 오래되거나 큰 저장소를 전체 히스토리로
 * clone하면 시간·디스크를 과하게 쓴다(Phase 1의 max-pages·depth 제한과 같은 원칙을 GitHub 모드에도 적용).
 * clone 전 저장소 크기를 먼저 확인해(주입된 함수로) 상한 초과 시 아예 시도하지 않는다.
 */
export async function createSandboxClone(opts) {
    if (opts.fetchRepoSizeKb) {
        const sizeKb = await opts.fetchRepoSizeKb();
        const maxKb = opts.maxRepoSizeKb ?? DEFAULT_MAX_REPO_SIZE_KB;
        if (sizeKb !== null && sizeKb > maxKb) {
            throw new SandboxError(`저장소 크기(${sizeKb}KB)가 상한(${maxKb}KB)을 초과해 clone하지 않습니다`);
        }
    }
    registerExitCleanup();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), SANDBOX_PREFIX));
    activeSandboxes.add(tempDir);
    const cleanup = async () => {
        activeSandboxes.delete(tempDir);
        // 여긴 이미 async 컨텍스트라 동기 rmSync 대신 fs.promises.rm을 쓴다 — 재시도 대기(최대 5회×300ms)가
        // 이벤트 루프를 막지 않는다(sync 버전은 재시도 사이 정말로 블로킹된다).
        await fs.promises.rm(tempDir, RM_RETRY_OPTIONS);
    };
    try {
        await runGitCommand(["clone", "--depth", "1", opts.cloneUrl, tempDir], os.tmpdir(), opts.cloneTimeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS, opts.env);
    }
    catch (err) {
        await cleanup();
        throw err;
    }
    return { path: tempDir, cleanup };
}
//# sourceMappingURL=sandbox.js.map