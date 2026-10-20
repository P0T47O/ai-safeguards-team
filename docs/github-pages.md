# 发布到 GitHub Pages

游戏为静态网页，无第三方依赖、服务器或模型 API。发布内容是 `dist/`；完整创作源码与运行包可以放在同一仓库，GitHub Actions 会在推送后生成最新内容。

GitHub Free 可从公开仓库部署；从个人私有仓库部署 Pages 需要 GitHub Pro 或更高套餐。私有源码仓库与公开试玩网页可以同时存在，但网页运行必需的 JavaScript 与案卷 JSON 仍会公开发送给玩家浏览器。仓库公开范围应先选定，再创建仓库和上传。

## 完整源码仓库

当前发布名为 AI Safeguards Team：试用期，仓库名 `ai-safeguards-team`，作者署名 P0T47O。使用自定义非商业署名保留许可；创建仓库时不要选择 MIT、GPL 等其他模板许可证，以项目自带 LICENSE 为准。

1. 将当前项目上传到自己的 GitHub 仓库，默认分支使用 `main` 或 `master`。
2. 打开仓库 Settings → Pages → Build and deployment → Source，选择 GitHub Actions。
3. 打开 Actions → Publish game to GitHub Pages；首次设置后可用 Run workflow 手动发布。
4. 工作流完成后，在部署结果或 Settings → Pages 中取得试玩网址。

项目已包含 `.github/workflows/pages.yml`：构建案卷数据，再将 `dist/` 上传为 Pages artifact 并部署。后续推送到 `main` / `master` 会自动更新。没有安装依赖或运行测试的步骤。

发布时排除 `.openai/`、本地截图和发布临时包 `artifacts/`、环境文件与日志；这些目录仍保留在本机。不要添加访问令牌到仓库。

旧本地 Git 历史中曾跟踪 Sites 身份文件，所以不要直接把旧历史推送到新仓库。运行 `node scripts/prepare-github-release.mjs` 会创建白名单源码快照和 SHA-256 文件清单，只包含游戏源文件、构建脚本、说明、许可及部署配置，不带 `.git/`、`.openai/`、本地截图或临时文件。向新仓库发布这个干净快照。

## 只公开可玩文件

如果只希望建立发布仓库，可上传 `dist/` 内的内容，让 `index.html` 位于仓库根目录，然后在 Settings → Pages 选择 Deploy from a branch，分支选该发布分支，目录选 `/ (root)`。这种方式不使用项目根目录的构建工作流；每次更新前在本机运行 `npm run build:content`，再上传新版可玩文件。

仅发布运行包并不能隐藏浏览器需要读取的 JavaScript、剧情、评分 JSON；它只是不公开创作源文件与编辑脚本。

## 路径与存档

资源与数据采用相对路径，可以部署到 `https://用户名.github.io/仓库名/` 这样的项目子目录。进入网址后由 HTTP 加载，不能用双击 HTML 代替。

最高分与进度按浏览器、站点来源保存在本机。GitHub Pages、旧试玩站与本地预览的来源不同，不会自动互相迁移存档，也没有跨玩家公共排行榜。

参考：[自定义 Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[配置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
