# Inochi ASCII MV — 私有制作与协作仓库

为カンザキイオリ《命に嫌われている》制作原创程序化字符动画。
**当前包含 T01 的 S01 字符动画骨架与本地预览工作台；完整八镜头和视频尚未完成。**

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

## T01 本地运行

需要 Node.js 22.12+（本轮实际环境为 24.19.0）和 pnpm 11.25.0。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开本地 `http://127.0.0.1:5173`。首轮实现 S01 的固定字符人形、轻微呼吸、三类空间窗口与远处字符尘；可直接跳转 0、36、71 帧。镜头导航能查询全部 900 帧，S02–S08 明确标记“待实现”，画面保持 S01 尾帧。试听使用已裁切音轨的本地 0 秒，没有重复加 58 秒。

R001 动作修订已增加肩胸起伏、轻微俯仰与摆臂。点 **循环看 S01** 可无声反复查看这 1.2 秒；点“停止循环”、跳帧或“试听预览”会取消循环。它只用于动作审阅，仍未实现 S02–S08。最新截图与验证在 [reviews/t01-motion](reviews/t01-motion/README.md)。

```bash
pnpm test
pnpm build
python -m unittest discover -s tests -v
```

初次上传后 handoff 会正常演进，不要继续运行用于原始快照的 `check_package.py` 或 `publish_github.py`。后续通过工作分支和 PR 协作。

## 任意帧接口与三帧实拍

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

对已构建版本可另启动 `pnpm preview`，设置 `$env:PILOT_URL='http://127.0.0.1:4173'` 后运行实拍脚本。`pnpm review:ui` 默认检查此构建预览地址，验证跳帧、待实现提示和静音的浏览器试听控制，将结果写入 `reviews/t01/ui-report.json`；浏览器播放不代表人耳听审或歌词/鼓点精校。

脚本只连接本机，等待就绪后保存 `reviews/t01/frame-000.png`、`frame-036.png`、`frame-071.png` 及 `browser-report.json`；乱序复绘比较同一浏览器的截图与 WebGL 像素 hash，失败返回非零。运行真实结果以 handoff 与报告为准。

本轮没有 MP4、FFmpeg 合成、1080p60 全序列、歌词/鼓点精校或导演通过结论。系统字体未随包分发；同一后端复现验证不能推广为跨硬件逐像素一致。
