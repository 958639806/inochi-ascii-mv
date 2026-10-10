# 发布执行记录 — 2026-10-10

- 目标：`958639806/inochi-ascii-mv`，仅允许 Private；禁止强推或覆盖已有项目。
- 附件已解压到当前项目目录，首先读取了 `START_HERE.md`。
- 使用 bundled Python 3.12.14；官方 GitHub CLI 2.102.0 放在项目上层的 `.tools/gh-v2.102.0/bin/gh.exe`，未修改全局 PATH。
- 官方 CLI ZIP SHA256 已核验：`ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4`。来源：https://github.com/cli/cli/releases/tag/v2.102.0

## 实际执行与结果

1. `python scripts/check_package.py`：PASS；24 个包文件、8 个连续镜头、900 帧、15 秒 FLAC（48 kHz / 24-bit / stereo）。
2. `python -m unittest discover -s tests -v`：13 tests，OK。
3. `python scripts/publish_github.py --publish`：退出码 1；`gh api user --jq .login` 返回 HTTP 401。尚未创建本地 Git 仓库，未执行远端建库或推送。
4. `gh auth login --hostname github.com --web --git-protocol https --skip-ssh-key`：第一次遇到 TLS handshake timeout；第二次已进入 GitHub 官方设备登录流程，等待用户在浏览器授权。设备代码及任何凭据不存入项目。
5. 检查既有 Windows 本地代理 `127.0.0.1:7890`，TCP 可达，经代理访问 GitHub 的 TLS 验证成功。仅在子进程环境设置代理后的 `gh api user --jq .login` 仍提示需要登录；浏览器授权尚未完成。没有更改系统代理设置。

## 当前待办与待审

- 完成正常 CLI 登录后，确认账户为 `958639806`；若目标已存在，额外检查远端 refs（含 tags），确保不覆盖已有内容。
- 登录成功后重新执行原发布命令，核实远端提交 SHA 与 `private=true`，再读取实施交接文件并开始 T01。
- 当前未开始 T01，没有动画产物或导演审阅 PR。
- 本文件为执行日志；原始包快照的受校验文件未更改。不可将本记录当作上传成功证明。

## 更新 — 已解除认证阻塞并核验上传

- 用户完成正常设备授权，CLI 实际确认登录 `958639806`；没有复制连接器凭据。
- 授权后首次发布因建库前 TLS timeout 退出，复查目标仍不存在、本地无 `.git`，再执行原命令。
- 第二次执行已创建 Private 仓库并推送初始提交，随后 API metadata 请求 TLS timeout，脚本退出码为 1；不盲目重复 bootstrap。
- 实际复核：仓库 `958639806/inochi-ascii-mv`，`private=true`，`visibility=private`；本地 HEAD 和远端 main 均为 `dc362e9d43dffd1c3d0247332c2824e26de9ae52`。
- 远端实际 URL：https://github.com/958639806/inochi-ascii-mv
- 初始上传已确认成功；后续补齐发布记录再切 `codex/pilot-v1`，按交接文档实施 T01。
- 上面的等待登录和“尚未创建”记录描述各次尝试当时的状态，现已解除。
