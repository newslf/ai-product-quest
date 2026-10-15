# AI QUEST 实操包 · 2026-10-15

所有业务记录均为合成材料，不是公司数据或真实收益。先写预测，再运行，再解释差异。

## 第一次运行

安装或使用已有 Python 3，解压整个包。打开终端并进入解压目录。先运行 `python --version`，再运行下面的命令。Windows 也可以使用 `py` 或 Python 的完整路径替换 `python`。离线实验只使用标准库，不需要安装第三方依赖。

```text
python practice.py threshold --threshold 0.35
python practice.py threshold --threshold 0.7
python practice.py inspect
python practice.py model --mode replay --prompt basic
python practice.py model --mode replay --prompt evidence
python practice.py retrieval --method keyword --topk 2
python practice.py retrieval --method tfidf --topk 2
python practice.py retrieval --method tfidf --valid-only --topk 2
python practice.py tools --scenario normal
python practice.py tools --scenario timeout
python practice.py tools --scenario duplicate
python practice.py tools --scenario denied
python practice.py value
```

每次运行会显示结果，并在本机 `runs/` 保存带时间戳的 JSON。将摘要写到网站实验记录；网页不会自动上传本机文件。已有模型调用、缺失运行条件和回放模拟必须分别标记。

## 材料与实验的关系

- `risk.csv`：20 单人工标签与风险分数，用于阈值和复核量。
- `leakage.csv`：预测时点、观测、站点和事后结果，练字段可用性与实体切分。
- `tickets.json`：12 个工单，`replay.json` 为固定回放。回放故意保留结构错误或事实缺陷，供人工检查；更换提示不会更改回放结果。
- `prompts.json`：basic/evidence 两种任务说明。只比较回放不能证明提示效果。真实调用需要同模型、同样本、多次运行。
- `documents.json`：12 份规范，包含照片规则与关闭规则两组版本变化，结束日不包含在有效区间。
- `questions-dev.json`：12 道开发题。`questions-holdout.json`：6 道保留变式。请先不阅读保留题与参考答案，开发结束再检查。自编题和可见答案的独立性有限，不能当作业务泛化保证。
- `reference.json`：参考证据和人工判定要求。脚本用其算证据 Hit@K。不是完整回答评分器。
- `times.csv`：8 个任务的配对人工计时，示例调用成本不代表任何供应商价格。
- `experiment-record.md`、`project-brief.md`：记录模板。

## 真实检索与 RAG 案件

keyword 是字符二元组集合匹配；tfidf 是字符二元组统计向量的真实余弦计算，两者都不是模型语义 Embedding。比较时保持材料、问题、K 不变，只改变方法。随后固定方法测试有效日期过滤。

```text
python practice.py retrieval --method tfidf --valid-only --split holdout --topk 2
python practice.py retrieval --method tfidf --valid-only --at 2026-08-15 --topk 2
```

每题默认使用自身的 `as_of`。`--at` 改变真值条件，因此脚本关闭 Hit@K 判分，需自行重新标注。无答案题不计入有答案的 Hit@K 分母，要另外检查是否错误作答。该脚本只检索；用输出的候选上下文写建议或在自己的模型环境生成，再人工检查引用支持度。不得把检索命中当作完整 RAG 正确率。

## 可选：真实模型与语义向量

只在你已有可用账户、清楚调用环境与费用时操作；本网站不提供账户或额度。脚本采用常见兼容接口：`POST /chat/completions` 与 `POST /embeddings`。基地址一般包含服务商要求的版本路径。提供方可能有参数差异，按其官方文档核对。当前对话请求使用 temperature=0、max_tokens=512；不支持这些参数的提供方需要先在本地调整。

在本机终端设置这些环境变量：

- `AI_BASE_URL`：你所选兼容服务的 HTTPS 基地址，不带密钥或查询参数。
- `AI_API_KEY`：在本机安全环境提供的密钥，不写进代码、网页记录或 GitHub。
- `AI_MODEL`：可用聊天模型名。
- `AI_EMBED_MODEL`：可用 Embedding 模型名，仅向量实验需要。

```text
python practice.py model --mode live --prompt basic --repeat 3
python practice.py model --mode live --prompt evidence --repeat 3
python practice.py retrieval --method embedding --valid-only --topk 2
```

一个 model 运行会对 12 个合成工单各调用指定次数；repeat=3 即 36 次请求。embedding 运行会提交规范与当前题集。结果记录模型、提示、输出、用时及接口返回的 usage；结构检查不代替事实检查。真实接口未配置时实验会停止，不会以模拟结果伪装成功。错误响应体不会输出；可先核对网络、权限和参数。

## 自查与复盘

使用 `experiment-record.md` 记录假设、固定条件、唯一变化、实际输出、坏例、限制和下一步。选择一个输入亲自修改再跑，解释结果为什么变化。模型生成代码或文字可用作帮助，但本人无法解释的部分标“借助提示完成”。

项目路径：P0 规则基线 → P1 文本理解 → P2 检索与引用 → P3 模拟工具 → P4 对照评测 → P5 迁移与试用。该包提供学习起点，不代表已连接业务系统或完成真实试点。
