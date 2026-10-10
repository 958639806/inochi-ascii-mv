# 当前状态

更新日期：2026-10-10。

| 项目 | 状态 | 证据 / 限制 |
|---|---|---|
| 1080p60、15秒范围 | DONE | 用户确认；config/pilot.timeline.json |
| 八镜头任务书 | DONE | docs/PILOT_TASK.md；仍待音画精校 |
| 试片音频 | DONE | assets/audio/pilot_058-073.flac；15.000秒 |
| 原创作说明、全曲草案、结构图 | DONE | 原文件已复制；此轮没有重新判读结构图 |
| 私有 GitHub 建库与上传 | DONE | private=true / visibility=private；远端 main 已核验：`dc362e9d43dffd1c3d0247332c2824e26de9ae52`；https://github.com/958639806/inochi-ascii-mv |
| T01 最小可运行骨架 | DONE | `6763c8fce6a9aead392377402234def69726f0c9`；Vite/TS/Three；固定 1426 字符 ID；S01 呼吸/窗口；任意帧接口 |
| S01 视觉验收 | NEEDS_REVIEW | reviews/t01/frame-000.png、frame-036.png、frame-071.png；构图/姿态/呼吸幅度待导演审阅 |
| 全部 900 帧镜头查询 | DONE | 38 项 Vitest 覆盖全部帧与边界；900 拒绝；S02–S08 明确未实现 |
| 浏览器工程验证 | DONE | 开发及构建预览各 62/62；3 PNG 均 960×540；换种子、乱序复绘像素一致；UI/静音播放 12/12 |
| 动画引擎、角色、场景（完整试片） | DOING | 已有 S01 骨架；S02–S08 表演及爆裂/重组 TODO，不能用时间轴查询代替画面完成 |
| 逐句歌词与鼓点精校 | TODO | 音频能量不等于语义或鼓点标注 |
| Gemini / 豆包 / Grok 交叉解读 | TODO | 尚未实际调用，不能伪造意见 |
| 900帧视频与艺术审核 | TODO | 尚未渲染 |

私有发布记录已核验并推送到 main：`30e752e43c3f864c141e08f33aa0afe9e181b222`。T01 工作分支为 `codex/pilot-v1`；Draft PR：https://github.com/958639806/inochi-ascii-mv/pull/1 。工程检查通过不代表导演通过。像素一致仅在已记录的同一浏览器/GPU环境实测；没有 MP4 或 900 帧序列产物。
