# 素材与发布边界

用户提供的整曲 FLAC 保持原样，原始文件未包含在普通 Git 交接包中。包内为 `[58,73)` 秒的 15 秒派生片段：转为 48 kHz / 24-bit stereo FLAC，去除嵌入封面及媒体标签，用于试片制作；这不是声称与 192 kHz 母带比特完全相同。

音频的 SHA-256 与裁切方法见 assets/manifest.json。视频只使用这一片段时，音频起点已经是 0，不能再次跳到第 58 秒。

原曲录音与词曲不随本项目取得再分发许可。私有制作不等于授权公开发布。任何公开 Demo 应先替换为获授权音轨或确认许可；本包不启用公开网站，也不附完整歌词。

参考：GitHub 普通 Git 文件上限 100 MiB，浏览器单文件上传上限 25 MiB；完整母带超过前者。后续整曲协作需要另行安排合适的私有大文件存储，不在本轮开启可能产生费用的 LFS 服务。
https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

发布脚本使用官方 GitHub CLI：
https://cli.github.com/manual/gh_repo_create
https://cli.github.com/manual/gh_auth_login
