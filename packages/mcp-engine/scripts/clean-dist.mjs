// tsc는 소스 파일이 삭제되어도 이전 빌드가 만든 산출물(.js)을 자동으로 지우지 않는다(문서화된 동작).
// 브랜치를 옮겨 다니며 빌드하면 존재하지 않는 소스의 컴파일 결과가 dist/에 그대로 남아,
// packages/plugin/mcp-server/로 복사될 때 실제로는 없는 기능 코드가 섞여 들어가는 위험이 있다
// (실측: content-structure.ts를 지운 브랜치에서도 content-structure.js가 dist에 남아있었음).
// "npm run build" 전에 항상 실행되어(prebuild) 이 문제를 원천 차단한다.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const engineRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
rmSync(path.join(engineRoot, "dist"), { recursive: true, force: true });
