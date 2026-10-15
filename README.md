# AI 产品经理闯关营 · AI QUEST

面向有数据产品经验、希望拓展 AI 产品能力的互动学习网页。

## 第一版

- 六章、18 个知识节点；直觉、原理、操作建议、常见误区、验证题与官方资料。
- 三个完整合成业务关卡：供应链证据缺口、运维工单预审、RAG 版本错误。
- 两个可重复实验：分类阈值与混淆矩阵；知识版本、分块及候选数的规则模拟。
- 三类面试训练，每题三轮预设追问和显式自查标准。
- 阅读、节点练习、关卡、错题、笔记、实验与面试记录分别保存。
- JSON 导出与合并导入；无账号服务器同步，数据仅保存在当前浏览器。
- 手机与电脑响应式布局、键盘导航、对话框与减少动画支持。

## 运行

应用无构建与第三方运行依赖。用静态服务器托管 `dist/`；也可直接打开 `dist/index.html`，但文件 URL 下的本地存储行为取决于浏览器。

例如在本目录执行 `python -m http.server 4173 --directory dist --bind 127.0.0.1`，打开 `http://127.0.0.1:4173`。

## 实现边界

首版没有接入真实模型 API。关卡反馈与追问为预设教学内容；检索实验是显式标注的规则模拟，不执行 Embedding 或模型生成；阈值实验使用固定合成样本计算真实混淆矩阵。

开放式回答保存为未评审笔记，自查标准不代表机器评分或录用概率。业务案例全部独立编写为合成情境，不包含原始企业文档或真实业务记录。招聘链接为既有查询的公开列表，标明查询日期和未确认的招聘状态。

源文件：`dist/index.html`、`dist/styles.css`、`dist/content.js`、`dist/app.js`。

## 公开访问与 GitHub Pages

源码仓库：https://github.com/newslf/ai-product-quest

学习网址：https://newslf.github.io/ai-product-quest/

网页无需 ChatGPT 或 GitHub 登录。学习记录保存在浏览器中，不会写入 GitHub 仓库；换网址后请先在旧网址导出 JSON，再到新网址导入。

GitHub Pages 使用 `gh-pages` 分支根目录发布，内容来自 `main` 分支的 `dist/`。后续更新：

```sh
git add dist README.md qa.cjs .gitignore
git commit -m "Update learning site"
git tag deploy-YYYYMMDD-HHMM
git push origin main --tags
git subtree push --prefix dist origin gh-pages
```

每次发布前记录唯一的版本标签。恢复旧版时，从旧标签取回 `dist/` 并提交新版本，再执行上述发布步骤，不需要强制推送。

## 浏览器验证

测试脚本 `qa.cjs` 依赖 Playwright。安装 Playwright 与 Chromium，启动上面的本地静态服务器后执行 `node qa.cjs`。也可用环境变量 `QUEST_BASE_URL` 指定测试网址，用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装浏览器的路径。测试使用独立浏览器上下文与合成输入，不修改真实学习记录。

`.openai/hosting.json` 仅保留原 Sites 托管标识；GitHub Pages 不依赖该文件。
