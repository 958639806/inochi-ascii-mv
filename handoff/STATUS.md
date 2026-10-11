# 当前状态

更新：T02 / 八段动态初版；实际执行时间见 `reviews/pilot-v2/export-report.json`。

| 项目 | 状态 | 证据 / 限制 |
|---|---|---|
| 1080p60、15秒范围 | DONE | 用户确认；config/pilot.timeline.json |
| 八镜头任务书 | DONE | docs/PILOT_TASK.md；仍待音画精校 |
| 试片音频 | DONE | assets/audio/pilot_058-073.flac；15.000秒 |
| 原创作说明、全曲草案、结构图 | DONE | 原文件已复制；此轮没有重新判读结构图 |
| 私有 GitHub 建库与上传 | DONE | private=true / visibility=private；远端 main 已核验：`dc362e9d43dffd1c3d0247332c2824e26de9ae52`；https://github.com/958639806/inochi-ascii-mv |
| T01 最小可运行骨架 | DONE | `6763c8fce6a9aead392377402234def69726f0c9`；Vite/TS/Three；固定 1426 字符 ID；S01 呼吸/窗口；任意帧接口 |
| 张力与动作视觉验收 | NEEDS_REVIEW | R002 要求大幅度；最新全段视频和24实拍帧在 reviews/pilot-v2/；未用工程测试代替导演验收 |
| 全部 900 帧镜头查询 | DONE | 八段动态初版已接通，65 Vitest 覆盖状态/边界/事件，900 拒绝；后续不再保持S01尾帧 |
| T02 爆裂与同 ID 重组 | DONE | 1426 ID/hash固定；258后定向爆散，420–548有序回流，约6%低亮缺口；事件仍未听审 |
| 浏览器工程验证 | DONE | 构建和65单测通过、13交接测试通过、122/122浏览器；24帧960×540，乱序复绘像素一致 |
| 动画引擎、角色、场景（初版） | DONE | 围困/护头、文字墙/推拒、爆裂、后台核心、回流前冲、近景/余震均有按帧动画；精修待审 |
| 逐句歌词与鼓点精校 | TODO | 音频能量不等于语义或鼓点标注 |
| Gemini / 豆包 / Grok 交叉解读 | TODO | 尚未实际调用，不能伪造意见 |
| 960×540 / 60fps 预览 MP4 | DONE | 15.00 s，900帧全解码、900不同帧、无相邻重复；H264/yuv420p + AAC48k stereo；export-report.json |
| 1080p60 正式母版 | TODO | 尚未导出，不能把540预览当正式交付 |

私有基线 main：`30e752e43c3f864c141e08f33aa0afe9e181b222`。工作分支 `codex/pilot-v1`，Draft PR：https://github.com/958639806/inochi-ascii-mv/pull/1 。工程检查通过不代表导演通过。已有540预览MP4；没有提交900张帧序列、公开部署或自动合并。像素一致只在已记录的同一浏览器/GPU环境实测。
