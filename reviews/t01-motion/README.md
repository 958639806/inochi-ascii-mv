# T01 动作修订 — R001

回应用户反馈“人物感觉没有动”。旧版默认种子下，固定相机投影估算的头部/肩胸最大位移仅约 0.62/0.91 像素；正常试听到 1.2 秒后进入尚未实现的镜头，身体保持 S01 尾帧。

现在肩胸约 3.44 像素、头部约 4.03 像素、双臂约 6.2 像素（同一固定相机换算的估计，非跨硬件保证）。动作来自身体关节和胸肩起伏；腿脚固定，1426 字符 ID / `149d2e90` 保持。完整逐帧位移依据见 [baseline-motion.json](baseline-motion.json) 与 [revised-motion.json](revised-motion.json)。

## 直接看动作

打开本地 `http://127.0.0.1:4173` 并刷新，点绿色 **循环看 S01**。它无声重复播放 S01 的 frame 0–71，便于持续观察；短段结束会返回首帧，不宣称无缝或新实现了后续镜头。

试听仍播放 15 秒裁切音轨，1.2 秒后的 S02–S08 仍保持尾帧。手动跳帧、`renderFrame`、停止或试听会取消无声循环，离线输出仍只由帧和种子决定。

## 实拍与检查

- [frame 000](frame-000.png)、[frame 036](frame-036.png)、[frame 071](frame-071.png)：本轮实际 960×540 WebGL PNG，未替换上一轮文件。
- [工作台按钮位置](workbench-loop.png)：循环中实际截图，只作按钮位置证据，不以一张截图证明运动观感。
- [unit-tests.txt](unit-tests.txt)：39 项 Vitest PASS，含身体运动幅度/腿脚固定与乱序复现。
- [build.txt](build.txt)：构建 PASS；仍有约 543 kB 单入口体积提示。
- [browser-report.json](browser-report.json)：62/62 PASS，边界、三帧、换种子和乱序像素复现。
- [ui-report.json](ui-report.json)：12/12 原试听/跳帧检查 PASS。
- [motion-ui-report.json](motion-ui-report.json)：16/16 循环、停止、手动跳帧、离线帧及试听切换检查 PASS；实际分时采样记录帧推进/循环，音频保持暂停。

静音 Playwright 测试不代表人耳听审或艺术通过。请导演在工作台评价起伏/俯仰/摆臂是否足够可见且仍克制。没有扩展 S02–S08、改变镜头时长、生成视频或启动其他模型。
