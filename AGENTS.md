# AGENTS.md

五子棋（连珠）竞赛版：Vue3 + TS + Vite + Pinia + three.js，AI 用 Rapfi（Emscripten→WASM）。
规则为中国五子棋竞赛规则(2025)、塔拉山口-10 开局 + 黑方禁手。UI 与代码注释均为中文。

## 命令
- `npm run dev` — Vite 开发服，5173（`server.host: true`，局域网可访问）。
- `npm run typecheck` — `vue-tsc --noEmit`。本仓库**无 ESLint/Prettier**，类型 + 测试就是质量门。
- `npm run test` — `vitest run`（node 环境，仅 `src/**/*.test.ts`）。
  - 单文件：`npx vitest run src/core/rules/rules.test.ts`；单用例：`npx vitest run -t "关键字"`。
- `npm run build` — 先 typecheck 再 `vite build` → `dist/`。
- `npm run server` — 独立局域网 WS 服，8787（`PORT` 环境变量可覆盖）。
- `npm run dev:all` — web + server 并发。
- `npm run app:dev` / `npm run app:build` — Tauri 桌面壳（dev 连 5173）。
- 改逻辑后固定验证顺序：`npm run typecheck && npm run test`。

## 架构：有两套前端，别搞混
- `index.html` + `src/` = 真正的游戏应用，经 Vite 构建到 `dist/`。
- `src-tauri/manager/index.html` = Tauri 窗口 UI（服务管理器），**不经 Vite、不参与前端构建**，由 `tauri.conf.json` 的 `frontendDist: "./manager"` 直接内嵌。
- 桌面壳 `src-tauri/src/lib.rs` 用 rust-embed 把 `dist/` 在**编译期**内嵌进 exe（`#[folder = "../dist/"]`）。运行时：**8080** 托管游戏静态资源、**8787** 跑局域网对战 WebSocket（axum），窗口内可启停 8787。
- 前端局域网默认连 `ws://<当前主机>:8787`（`src/stores/lan.ts`）。`server/index.mjs` 是同一协议的手写 dev 版服务，供无 Tauri 时开发用。
- AI 两条路径（`src/stores/game.ts` → `computeAiAction`）：自由落子（`Expectation.kind === 'stone'`）优先用 Rapfi WASM（`src/core/ai/rapfi.ts`）；开局受限着法与 Rapfi 不可用时回退自研 JS 引擎（`search.ts`/`evaluate.ts`/`decide.ts` + `ai.worker.ts`）。

## 关键约定
- 棋盘 15×15；`r=0` 最下排、`c=0` 最左 A 列；天元 H8 = (r7,c7)；`BLACK=1`/`WHITE=2`；落子范围用 `withinSquare`（天元为中心的方框）。
- 对局期望 `Expectation.kind`：`stone` / `swap` / `fifth-mode` / `offer` / `pick` / `end`。
- 默认设置（`src/stores/settings.ts`，持久化键 `gomoku.settings.v1`）：模式 `tara-10`、禁手开、玩家执黑、首页默认停在"人机"页签。
- 路径别名 `@` → `src`（`vite.config.ts` 与 `tsconfig.json` 均配置）；`tsconfig` 开启 `strict`/`noUnusedLocals`/`noUnusedParameters`，未使用变量会导致 typecheck 失败。
- `vite.config.ts` 用 `vitest/config` 的 `defineConfig`，一份配置同时承载 dev 与 test。

## 陷阱
- **改 `src/` 只有重建客户端后才会在 exe 中生效**（`dist` 在 Rust 编译期内嵌）。`npm run app:build` 会先执行 `npm run build`。
- **重建客户端前必须先结束正在运行的 `gomoku-manager.exe`**，否则 Rust 链接失败（文件被占用，`os error 5`）。
- `public/wasm/`（`rapfi.js`/`rapfi.wasm`/`rapfi-worker.js`）是运行时硬依赖、**已入库**；其 Emscripten 工具链不在仓库内（在 `%TEMP%`），不要假设能轻易重建。
- **不要给棋盘 WebGL 画布的祖先容器或覆盖层加 `backdrop-filter`**：在 Tauri 的 WebView2 下会导致画布整块闪黑（曾复现并已刻意移除相关样式，勿加回）。
- 测试是 node 环境（无 DOM），只能测纯逻辑，不能测 Vue 组件。
