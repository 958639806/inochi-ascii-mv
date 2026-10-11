# Inochi ASCII MV — 私有制作与协作仓库

为カンザキイオリ《命に嫌われている》制作原创程序化字符动画。
**当前包含 15 秒八镜头动态初版、可交互工作台与实际 960×540/60fps 预览 MP4。1080p60 正式版、歌词/鼓点校准和艺术验收尚未完成。**

## 已确定
- 成片：1920 × 1080，60 FPS，MP4 / H.264。
- 当前只制作原音频 00:58.000–01:13.000 的 15 秒试片，共 900 帧。
- 创作核心：歌词含义；原 MV 只辅助理解，不复刻。
- 不调用生成式图片或视频服务。允许程序化三维、字符图集与 GLSL。
- 保持私有；不启用 GitHub Pages，不自动公开音频、预览或原歌词。

## 从这里接手
1. 初次上传：读 [START_HERE.md](START_HERE.md)。
2. 开始工作：读 [AGENTS.md](AGENTS.md)、[handoff/STATUS.md](handoff/STATUS.md)、[handoff/NEXT.md](handoff/NEXT.md)。
3. 实现依据：[15 秒任务书](docs/PILOT_TASK.md)、[机器可读分镜](config/pilot.timeline.json)。
4. 完成一轮：提交代码、更新状态，把真实测试和抽帧结果写入 [handoff/RESULTS.md](handoff/RESULTS.md)。
5. 导演反馈：写入 [reviews/DIRECTOR_REVIEW.md](reviews/DIRECTOR_REVIEW.md)，再由 Codex 逐条处理。

## 素材
- `assets/audio/pilot_058-073.flac`：从用户音轨裁出的 15 秒片段，48 kHz / 24-bit / stereo，已从零开始计时。
- `assets/manifest.json`：来源、哈希、裁切与音频探测结果。
- `assets/reference/audio-structure.png`：先前生成的全曲结构参考图，未经本轮重新判读。
- `config/full-song.timeline.draft.json`：先前的全曲时间轴草案，**不是逐句歌词或鼓点标注**。
- `docs/ORIGINAL_CREATIVE_PLAN_v0.1.md`：原创作说明，原样保留。

原始约 160 MiB FLAC 不放入普通 Git；仍保留在原会话素材中。本包音频足以制作当前试片，整曲开发时另行处理母带。

## 协作的真实边界
仓库是共同工作记录，不是两个模型自动互发消息的服务。每轮启动时读取最新提交，完成后写回；只有被启动且具备该仓库访问权的会话才能参与。不要虚构 Gemini、豆包、Grok 的意见或后台审核。

## 初次解压时的自检（不需要安装第三方 Python 库）
```bash
python scripts/check_package.py
python -m unittest discover -s tests -v
```

`check_package.py` 校验初始交接快照；发布后 handoff 会正常更新，届时不应再把初始化校验当作持续集成。单元测试不要求 handoff 保持原文。

这些检查只验证素材、分镜和发布保护逻辑，不代表动画、审美、歌词对齐已通过验收。

## 本地运行（八段动态初版）

需要 Node.js 22.12+（本轮实际环境为 24.19.0）和 pnpm 11.25.0。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开本地 `http://127.0.0.1:5173`。八镜头已连通：大幅呼吸/重心偏移 → 收缩护头/空间围困 → 推拒与文字围墙 → 定向爆散 → 胸口核心/空旷后台 → 同 ID 回流和跨步前冲 → 近景对峙 → 余震后撤。1426 个字符 ID 保持；固定种子可查询全部 900 帧。试听使用已裁切音轨的本地 0 秒，没有重复加 58 秒。

点 **循环看全段** 无声重复 15 秒，或点“试听预览”配音乐。停止、跳帧与试听会取消循环。最新视频、24 张实拍关键帧和验证在 [reviews/pilot-v2](reviews/pilot-v2/README.md)；首轮 T01 与 R001 历史产物保留。

```bash
pnpm test
pnpm build
python -m unittest discover -s tests -v
```

初次上传后 handoff 会正常演进，不要继续运行用于原始快照的 `check_package.py` 或 `publish_github.py`。后续通过工作分支和 PR 协作。

## 任意帧接口与实拍检查

```javascript
await window.pilotReady;
const evidence = await window.renderFrame(36, 958639806);
```

`pilotReady` 等待字体、字符图集、WebGL 场景与首帧就绪。`renderFrame` 会暂停试听，再从固定采样和种子重建画面，返回镜头、时间、实现状态、字符 ID hash、相机与有限数值证据。输出帧必须为整数 0–899；seed 必须为 uint32。离线结果不读取墙钟、实时音频分析或上一帧状态。

另开终端、保持 Vite 运行：

```bash
# 首次使用 Playwright bundled Chromium 时，先安装浏览器：
pnpm exec playwright install chromium
pnpm review:frames
```

也可使用已安装的 Edge（本轮实际采用此路径）：

```powershell
$env:PILOT_BROWSER_CHANNEL='msedge'
pnpm review:frames
```

对构建版本先运行 `pnpm build` 与 `pnpm preview`，设置 `$env:PILOT_URL='http://127.0.0.1:4173'` 后运行检查。当前 `review:frames` / `review:ui` 都调用全段检查脚本：24 个配置审阅帧、镜头边界、爆裂/重组指标、乱序复绘、全段无声循环/精确暂停。报告保存到 `reviews/pilot-v2/browser-report.json`。旧 S01 检查脚本仅保留作历史工具，不再作为当前默认入口。

脚本只连接本机，等待就绪后实拍全部配置审阅帧；乱序比较同一浏览器的 PNG 与 WebGL 像素 hash，失败返回非零。真实结果以 handoff 与报告为准。

## 预览视频与可复现导出

实际预览：[preview-960x540.mp4](reviews/pilot-v2/preview-960x540.mp4)，960×540、60fps、900 帧、15 秒，H.264/yuv420p + AAC 48 kHz 双声道。工程验证及完整解码记录见 [export-report.json](reviews/pilot-v2/export-report.json)。这不是 1080p60 正式母版，也没有歌词/鼓点精校或导演通过结论。

保持本地构建预览运行，指定可用 FFmpeg 执行文件，再执行：

```powershell
$env:PILOT_FFMPEG='C:\path\to\ffmpeg.exe'
$env:PILOT_URL='http://127.0.0.1:4173'
$env:PILOT_BROWSER_CHANNEL='msedge'
pnpm export:pilot
```

导出逐帧等待 `renderFrame`，将 PNG 流输入 FFmpeg；没有实时录屏或提交 900 张帧序列。已有视频默认拒绝覆盖；确需替换本项目的此预览时用 `pnpm export:pilot --overwrite`。音轨仅在最后合成一次 AAC。系统字体不随包分发；同一后端复现验证不能推广为跨硬件逐像素一致。
