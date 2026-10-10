# Inochi ASCII MV — 私有制作与协作仓库

为カンザキイオリ《命に嫌われている》制作原创程序化字符动画。
**当前交付是任务书和素材交接包，不是已完成的动画程序或视频。**

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
