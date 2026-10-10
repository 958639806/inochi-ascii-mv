# 执行结果 / 回信

当前仅建立了交接包；动画、远端仓库、PR 均未在打包时完成。

每轮按以下模板追加，不覆盖之前已验证的记录。

## Round N / 日期 / 执行者
- 起始 commit：
- 工作分支与结果 commit：
- 本轮任务 ID：
- 实际修改：
- 测试命令与真实结果：
- 产物路径（私有位置，不放临时不可访问的路径冒充仓库文件）：
- 三个最值得审阅的帧 / 镜头：
- 未完成或阻塞项：
- 下一步建议：
- 是否需要用户/导演决策：

注意：这是可复查的结果记录，不是要求记录模型内部推理。

## Round 0 / 2026-10-10 / Codex — 私有发布已核验
- 本轮任务 ID：T00。
- 实际仓库：https://github.com/958639806/inochi-ascii-mv
- Private：GitHub API 实际返回 `private=true`、`visibility=private`。
- 初始提交：`dc362e9d43dffd1c3d0247332c2824e26de9ae52`；`gh api repos/958639806/inochi-ascii-mv/git/ref/heads/main --jq .object.sha` 与本地 `git log` 完全一致。
- 原发布命令已实际执行。首次正常登录前 HTTP 401；授权后一次建库前超时，确认仓库仍不存在后重试；重试完成初始推送，但上传后 metadata 请求超时，故脚本退出码仍为 1。
- 恢复方式：先核验远端与本地初始 SHA、Private 和提交历史，再手动补齐脚本本应写出的事实记录；未重复初始发布脚本、未强推、未覆盖已有内容。
- 真实测试：发布前 `python scripts/check_package.py` PASS（24 files / 900 frames / 15 s audio）；`python -m unittest discover -s tests -v` 13 tests，OK。
- 产物：任务书、配置、已批准的试片音频和原始交接文件已在私有远端初始提交中。
- 动画、视频、导演审阅：尚未实施或通过；下一步进入 T01。

## Round 1 / 2026-10-10 / Codex — T01 工程完成，视觉待审
- 起始 commit：`30e752e43c3f864c141e08f33aa0afe9e181b222`（已核验远端 main）。
- 工作分支与结果 commit：`codex/pilot-v1`；实现与实拍证据提交 `6763c8fce6a9aead392377402234def69726f0c9`。后续交接记录提交见 PR head，未强推、未自行合并。
- 本轮任务 ID：T01。
- 实际修改：Vite + TypeScript + Three.js 与锁文件；唯一 JSON 时间轴查询；固定 1426 人体字符 ID（`149d2e90`）、按帧求值的呼吸/胸口明灭、三层窗口/字符尘/慢推；可等待字体/图集/首帧的 `window.pilotReady` 和 `window.renderFrame(frame, seed)`；跳帧、镜头导航及本地裁切音频试听。
- S01 frame 0/36/71 已实际渲染；0–899 均能查询镜头；S02–S08 标记未实现并保持 S01 尾帧，不声称完成后续画面。
- 实际环境：Node 24.19.0 / pnpm 11.25.0；Vite 8.3.4 / TypeScript 7.0.2 / Three.js 0.186.1 / Vitest 5.0.3 / Playwright 1.64.0。系统 Edge 154.0.4258.62，ANGLE / AMD Radeon 780M / D3D11；系统字体未分发，图集声明栈和回退限制见浏览器报告。
- 测试命令与真实结果：
  - `pnpm install`：成功安装 49 packages，生成 `pnpm-lock.yaml`；网络重试后完成。
  - `pnpm test`：2 files、38 tests PASS（900 帧覆盖、16 边界、非法帧、音频零偏移、固定 ID、乱序/种子与有限值）。
  - `python -m unittest discover -s tests -v`：13 tests，OK；发布后不再对演进的 handoff 运行初始快照校验。
  - `pnpm build`：PASS。初次 TS18048 已以 guard 后保存文案数组修复；最终有 541 kB 单入口 chunk 的默认体积提示，不阻止构建。
  - `PILOT_BROWSER_CHANNEL=msedge node scripts/render_keyframes.mjs`（5173 开发预览）：62/62 PASS。
  - `PILOT_URL=http://127.0.0.1:4173 PILOT_BROWSER_CHANNEL=msedge node scripts/render_keyframes.mjs`（构建预览）：62/62 PASS；3 张 960×540 PNG；71/0/36/0/71/36 乱序与种子切换后像素/PNG hash 全部复现；开发与构建三帧 hash 一致。
  - `PILOT_URL=http://127.0.0.1:4173 PILOT_BROWSER_CHANNEL=msedge node scripts/check_preview.mjs`：12/12 PASS；按钮/输入/待实现提示、15 秒 FLAC 实际解码与本地零偏移播放、暂停和离线精确帧。浏览器静音，不是人耳听审。
  - 上述 env 记法用于说明，PowerShell 用 `$env:...` 赋值。实际输出在 `reviews/t01/` 的 `.txt`；日志只规范行尾/尾部空白，不改结果。
- 已解决的检查失败：metadata 预加载让浏览器取消 FLAC 范围请求，首轮截图检查为 61/62；改为点击试听才加载（`preload=none`），最终截图检查无失败请求。未将初轮失败改写成通过。
- 产物路径：`reviews/t01/frame-000.png`、`frame-036.png`、`frame-071.png`；`browser-report.json`、`browser-report.dev.json`、`ui-report.json`；审阅索引 `reviews/t01/README.md`。
- 三个最值得审阅的帧 / 镜头：S01 的 000（轮廓/空间）、036（字符密度/明暗）、071（尾部构图/后景窗与头部）。
- 未完成：S02–S08 表演、T02 爆裂/重组、歌词/鼓点精校、动态视频、FFmpeg/MP4/1080p60 全序列、导演验收。未调用或虚构 Gemini / 豆包 / Grok 意见。
- 下一步建议：导演审阅此轮 PR；必要时只改 S01 的最小比例/姿态/亮度；随后沿同一字符 ID 实施 T02 S04/S06。
- 是否需要用户/导演决策：是。人形比例与偏直姿态、细字符是否保留；后景窗明暗/遮挡关系；动态试听下呼吸与慢推幅度。待审问题同时写入 PR，不自动启动其他模型或合并。
- 实际 Draft PR：https://github.com/958639806/inochi-ascii-mv/pull/1 。创建前已核验远端分支为 `dffd93a4e8f8ef9c974a2ebe585a20aafe06fd89`，与本地 HEAD 一致；创建返回真实 URL，仓库 Private。当前补写 PR 链接的提交将正常追加到同一分支，不强推或合并。

## Round 2 / 2026-10-10 / Codex — R001 人物像静止
- 起始 commit：`8ca9f7ad786bf27cc6e6230c186e6a549deb59a9`；同一 `codex/pilot-v1` 分支与 Draft PR #1，结果提交见此轮 PR head。
- 用户直接反馈：人物感觉没有动。查证旧版头/胸最大 XY 位移投影估算约 0.62/0.91 px；真实试听 1.35 s 时到 frame 81 / S02，确实保持 S01 尾帧（不是播放器未推进）。
- 修改：只调整 S01，肩胸起伏约 3.44 px、头部俯仰约 4.03 px、双臂约 6.2 px；腿脚固定、字符 ID/seed/镜头时长不变。以上为 960×540、固定相机参数的换算估计，未夸大为实际逐像素或跨硬件保证。
- 新增“循环看 S01”无声短段预览，反复 0–71 后回首帧；停止/手动跳帧/`renderFrame`/试听互斥，不影响按帧离线复现。没有用它假装实现 S02–S08。
- 实际测试：`pnpm test` 39 PASS（含运动幅度与固定腿脚）；`pnpm build` PASS（543 kB chunk 提示保留）；构建预览 `render_keyframes.mjs` 62/62 PASS；`check_preview.mjs` 12/12 PASS；`check_motion_preview.mjs` 16/16 PASS。均用系统 Edge / Playwright；播放测试静音。
- 本轮浏览器命令：`$env:PILOT_BROWSER_CHANNEL='msedge'; $env:PILOT_URL='http://127.0.0.1:4173'; $env:PILOT_OUTPUT_DIR='reviews/t01-motion'` 后分别执行 `node scripts/render_keyframes.mjs`、`node scripts/check_preview.mjs`、`node scripts/check_motion_preview.mjs`。
- 位移记录：实际 Node + Playwright 调用旧 HEAD 快照和当前源码的 `sampleCharacterFrame`，逐一取 0–71 帧各字符 XY 范围，按固定相机 38°/10.9 距离/540 高换算；旧源码临时文件已删除，无帧序列提交。报告记录这是估算，不是音乐同步或艺术认可。
- 产物：`reviews/t01-motion/` 中 baseline/revised-motion.json、3 实拍关键帧、workbench-loop.png、3 类浏览器报告与真实命令输出；上一轮 `reviews/t01/` 原文件保留。日志仅规范行尾空白。源码修改后的 Python 交接测试本轮未重跑，其配置与音频未修改。
- 待审：是否现在能清楚感到肩胸/头/手动作、是否仍克制；短段循环返回首帧的回跳仅用于预览。R001 状态 ADDRESSED，等待用户/导演确认，不标 VERIFIED。
- 下一步：复审 R001，再沿既有 NEXT 进入 T02；没有扩大到全曲、导出 MP4 或自动合并。
