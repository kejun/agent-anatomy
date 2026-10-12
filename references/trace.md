# Trace 导入与统计

v1 支持完成的 span；支持本地 JSON、JSONL、Chrome Trace X/配对 B/E 及 OTLP JSON resourceSpans。不读取二进制 protobuf，不启动采集，不推断 trace 中缺失的调用。

## 标准格式

标准输入为 {spans:[...]} 或 span 数组。每条 span 包含：
id、traceId、parentId（可空）、nodeId（可空）、domainId（可空）、name、startMs、endMs、status、attributes。

- startMs、endMs 是同一时间基准的有限毫秒数，且 endMs >= startMs。导入时以最早开始时间为 0。
- status 为 ok、error 或 unknown；缺失状态显示未知。未完成或无效 span 被诊断并排除，不补造结束时间。
- Chrome ts / dur 单位为微秒。B/E 按 pid/tid 维护嵌套栈；异步事件不支持，显示诊断。
- OTLP 纳秒时间以十进制字符串读取；先用 BigInt 相减再转毫秒，避免 epoch 转 Number 损失精度。状态码 1 为 OK，2 为 ERROR，0 为未知。
- Chrome args 和 OTLP attributes 保留。OTLP arrayValue / kvlistValue 递归转换；同时保留 statusMessage、events、links、resourceAttributes、instrumentationScope 和 raw 原始 span。Chrome B/E 的 raw 保存原始 begin/end 事件对。原始输入不能执行；界面以文本安全显示。

## 映射

先使用显式 nodeId / anatomy.node_id。没有显式节点时，仅按 span 名与部件 ID 或标签做精确匹配；重名不匹配。业务域读取 domainId / business.domain / anatomy.domain_id，再与域 ID 或名称精确匹配。

已映射节点决定其业务域，冲突属性显示诊断。未知显式 ID 不猜测。只有业务域可映射时，在该业务域新增“追踪活动”聚合部件；完全无法映射时保留在“未归属”业务域。不要用关键词猜测“翻译”“知识”或“播报”。

## 口径

显示记录数、错误数、平均 span 耗时、span 累计耗时及可用的 token 字段。总时间范围是最早开始到最晚结束；累计耗时是各 span 耗时之和。父子和并行 span 的累计值可能重复。

Token 读取 gen_ai.usage.input_tokens / gen_ai.usage.output_tokens，或 input_tokens / output_tokens，或 prompt_tokens / completion_tokens。缺一个字段时仍可展示已提供部分，并标明只统计有记录的字段。父子重复上报会重复计数。v1 不估算费用。

上限：单个输入文件 15 MiB、最多 15,000 个 span。列表每页 100 条，搜索、错误筛选与统计覆盖完整输入，不截断后段记录。导入失败保留当前画面。导入时不上传文件，也不把原始敏感内容发送到网络。

## 完整处理与定位

输入完整 traceId 可查看一次处理的全部记录；名称/ID/属性搜索用于定位具体操作。点击记录自动展开其部件层级并选中部件；错误定位到该记录结束时刻，其他记录定位到开始时刻。详情可跳到同 traceId 的父子记录，也可查看本次处理的完整分页列表。缺失父记录要明示，不补造调用。

业务域的条形比较使用完整文件的记录量、累计耗时、错误数或已记录 token；旁边的活动数和已发生错误数随游标变化。活动数按 span 计，不表示独立任务数。span 状态索引在模型变化时建立，回放时单次扫描并向上汇总，避免每个部件重复扫描全部记录。
