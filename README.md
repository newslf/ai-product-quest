# AI 产品经理闯关营 · AI QUEST

面向有数据产品经验、希望拓展 AI 产品能力的互动学习网页。

## 第二期：深入机制，亲手验证

- 十二阶段路线，8 小时/周约 12 周；4 小时/周延长为约 24 周，可手动切换当前阶段。
- 18 个深度单元：先修、预测、机制、数值/业务推演、独立变式、失败诊断、四种能力证据和定向阅读。
- 八个实操任务，配 14 个文件的可下载材料包。Python 标准库即可完成离线计算、实际关键词/TF-IDF 检索、回放解析和模拟工具演习。
- 可选本机真实模型与语义 Embedding 模式，需学习者自己的兼容 API 环境；网页不收集密钥，不代替其完成调用。
- 工单预审 P0—P5 主项目：记录产出、本人决策、未解决问题和完成方式。
- 首次提交解释后启动 1/7/21/45 天复测；提前练习不推进阶段，失败安排次日补练，保留历史回答。仅在页面打开时显示到期，无后台通知。
- 原有 v1 学习记录保留。新内容作为可选 learning 字段加入同一备份，导入同名内容保留本机版本。
- 记录完整度和学习者自评不等于独立能力认证；回放、辅助完成、独立完成明确区分。

推荐入口：`#path` → 本周深度单元 → 配套实操 → `#project` → `#review`。已有参数模拟保留在 `#labs` 作为热身。

内容文件：`dist/curriculum.js`。交互：`dist/growth.js`。实操包：`dist/materials/ai-quest-learning-kit.zip`，生成脚本为 `scripts/build-learning-kit.py`。

验证：`qa-growth.cjs` 检查旧记录迁移、证据/复测、材料下载与真实检索、备份、手机路径；`scripts/check-learning-kit.py` 在临时目录解压运行，检查计算、日期过滤、回放标识、故障与配对用时。测试不会调用真实模型 API。

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
