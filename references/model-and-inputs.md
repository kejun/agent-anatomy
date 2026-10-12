# 模型与输入

模型是 JSON 对象，schemaVersion 必须为 1。由 Agent 读 Markdown 并提取模型，再交给确定性渲染器。

## 必填字段

- title、summary：中文标题和具体解释。
- template：agent、software 或 ai-pipeline。
- mode：demo（合成步骤）、architecture（来源架构）、trace（导入后设置）。
- domains：{id, name, description} 数组。
- nodes：{id, domainId, label, kind, description, inputs, outputs, behaviour, evidence, sources} 数组。
- edges：{id, from, to, label, kind, evidence, sources} 数组；kind 为 data 或 control。
- sources：{id, title, url?, ref?} 数组；ref 可为源文件路径、行号或用户提供的段落标识。

ID 只用小写 ASCII 字母、数字、下划线和连字符，长度不超过 64。

kind 为 queue、console、processor、memory、tool、router、database、sensor、speaker 或 display。

evidence 为 source、provided、inference、demo 或 unknown。source 必须引用至少一个真实的 sources ID。不要将猜测标成 source。

## 可选字段

- node.parentId：同业务域内的父部件 ID。用于内部下钻，不代表调用关系；不要形成环。
- node.mechanism：可选容量、并发和重试上限；step.states 提供完整机械状态快照，见 behavior-states.md。
- steps：{id,title,description,active:[nodeId],edges:[edgeId]}。只驱动合成演示。
- theme：light 或 dark。
- spans：标准化 span 数组，见 trace.md。
- traceMeta：导入器输出的格式、警告和未归属信息。
- exampleTrace：可选的教学追踪输入，必须声明 synthetic:true。按实际输入改写模板时，删除不相关的内置 exampleTrace。

推荐让证据页保留仓库 URL、读取的 commit SHA、源路径与实现函数；页面不会读取在线仓库。仓库分析是使用技能的 Agent 完成的，不是一个只凭名字生成架构的自动扫描器。

作者模型最多 40 个业务域、240 个部件，每个域或父部件最多 16 个直接建模部件。traceGenerated 为导入器保留字段，不手动设置；导入最多另加 40 个域内聚合部件及一个未归属域/部件，避免合法模型因导入补充而超限。

## Markdown 文件

CLI 接受包含单个 anatomy JSON 代码块的 Markdown（也接受单个 json 块）。其余段落供 Agent 阅读，不自动进入模型。JSON 块的字段与上文一致。

普通自然语言输入的完整流程：读原文 → 选机制 → 写 JSON → 渲染 → 浏览器核验。输入内容不足时省略无法证明的关系，并显示未知。
