import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import treeKill from "tree-kill";
import { fetch as undiciFetch } from "undici";
export class RenderBridgeError extends Error {
    constructor(message) {
        super(`렌더 브릿지 오류: ${message}`);
        this.name = "RenderBridgeError";
    }
}
const DEFAULT_BUILD_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 15_000;
function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on("error", reject);
    });
}
/**
 * 대상 프로젝트(사용자 소유)의 node_modules에서 next 바이너리를 찾는다.
 * createRequire(projectRoot 기준)로 우리 엔진이 아니라 **대상 프로젝트의** next를 정확히 해석한다.
 */
function resolveNextBin(projectRoot) {
    const require = createRequire(projectRoot + "/package.json");
    try {
        return require.resolve("next/dist/bin/next");
    }
    catch {
        throw new RenderBridgeError(`대상 프로젝트에서 next 패키지를 찾을 수 없습니다: ${projectRoot}`);
    }
}
function spawnNext(nextBin, args, cwd) {
    // shell:false + argv 배열 — 명령어 주입 방지(M2 원칙). package.json의 "scripts"(사용자 정의,
    // 신뢰 불가)를 거치지 않고 next 바이너리를 직접 실행한다("npm run build"를 믿지 않는다는 설계 결정).
    return spawn(process.execPath, [nextBin, ...args], { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
}
function runToCompletion(child, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        let stderr = "";
        child.stderr?.on("data", (d) => (stderr += d.toString()));
        const timer = setTimeout(() => {
            treeKill(child.pid, "SIGTERM");
            reject(new RenderBridgeError(`${label} 타임아웃(${timeoutMs}ms)`));
        }, timeoutMs);
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(new RenderBridgeError(`${label} 실행 실패: ${err.message}`));
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0)
                resolve();
            else
                reject(new RenderBridgeError(`${label} 실패(exit ${code}): ${stderr.slice(-2000)}`));
        });
    });
}
async function waitForHealthy(origin, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const res = await undiciFetch(origin, { signal: AbortSignal.timeout(2000) });
            if (res.status > 0)
                return; // 응답만 오면 충분(200이든 404든 서버가 떠서 응답한다는 의미)
        }
        catch (err) {
            lastError = err;
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new RenderBridgeError(`로컬 서버 헬스체크 타임아웃: ${origin} (${String(lastError)})`);
}
function stopChild(child) {
    return new Promise((resolve) => {
        if (!child.pid) {
            resolve();
            return;
        }
        // tree-kill: Windows에서는 taskkill /T /F, POSIX에서는 프로세스 그룹 시그널로 자식까지 종료.
        // 단순 child.kill()은 next가 스폰하는 하위 프로세스를 못 잡아 포트가 계속 점유될 수 있다.
        treeKill(child.pid, "SIGTERM", () => resolve());
    });
}
/**
 * 폴더 → next build(신뢰불가 스크립트 경유 없이 바이너리 직접) → next start(127.0.0.1 고정 바인딩)
 * → 헬스체크 → { origin, port, stop() }. 실패 시 프로세스 정리 후 RenderBridgeError.
 */
export async function launchLocalNextServer(opts) {
    const nextBin = resolveNextBin(opts.projectRoot);
    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    const mode = opts.command ?? "build-start";
    if (mode === "build-start") {
        const buildChild = spawnNext(nextBin, ["build"], opts.projectRoot);
        await runToCompletion(buildChild, opts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS, "next build");
    }
    const serveArgs = mode === "dev" ? ["dev"] : ["start"];
    // --hostname을 127.0.0.1로 강제해 0.0.0.0(모든 인터페이스) 바인딩을 원천 차단(S5 심층방어).
    const serverChild = spawnNext(nextBin, [...serveArgs, "-p", String(port), "-H", "127.0.0.1"], opts.projectRoot);
    let earlyExitError;
    serverChild.on("exit", (code) => {
        if (code !== null && code !== 0)
            earlyExitError = new RenderBridgeError(`서버가 조기 종료됨(exit ${code})`);
    });
    try {
        await waitForHealthy(origin, opts.startHealthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
    }
    catch (err) {
        await stopChild(serverChild);
        throw earlyExitError ?? err;
    }
    return {
        origin,
        port,
        stop: () => stopChild(serverChild),
    };
}
/**
 * 서버를 띄우지 않고 `next build`만 실행한다(apply 후 재검증 전용).
 * launchLocalNextServer는 항상 포트 확보+start+헬스체크까지 하므로, "빌드만 다시 통과하는지" 확인하려는
 * apply 경로에 그대로 재사용하면 불필요한 서버 기동·헬스체크 실패 지점이 추가된다(설계 검토에서 확인).
 * 성공 시 정상 반환, 실패 시 RenderBridgeError를 던진다(성공/실패는 예외 여부로만 판단 — 값 반환 없음).
 */
export async function runNextBuildOnly(projectRoot, buildTimeoutMs = DEFAULT_BUILD_TIMEOUT_MS) {
    const nextBin = resolveNextBin(projectRoot);
    const buildChild = spawnNext(nextBin, ["build"], projectRoot);
    await runToCompletion(buildChild, buildTimeoutMs, "next build(재검증)");
}
//# sourceMappingURL=server-launcher.js.map