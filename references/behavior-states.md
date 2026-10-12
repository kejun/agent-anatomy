# 用状态解释机制

先写出要解释的约束及其来源，例如“等待容量 8、两个工位、每项任务最多重试一次”。再写出可检查的状态变化，最后选机械对象。没有依据的容量和策略不能当作项目事实。

## 配置和快照

node.mechanism 可包含 capacity（1–64）、concurrency（1–16）和 retryLimit（0–100）。每个字段必须是整数。它们是模型中明确声明的容量约束，不是实测用量。

step.states 按 node ID 提供完整快照；不能使用增量、函数或可执行脚本：

```json
{
  "states": {
    "queue": {"queueDepth": 6, "action": "dequeue"},
    "workers": {"activeWorkers": 2, "retries": 1, "completed": 0, "action": "retry"},
    "failure": {"failed": 0},
    "rejection": {"rejected": 1}
  }
}
```

queueDepth、activeWorkers、retries 必须分别有对应 capacity、concurrency、retryLimit，且不得超限。completed、failed、rejected 为非负整数。未提供的字段保持未知，不继承前一步；倒放和任意跳转必须得到同一快照。

activeWorkers 表示占用的工位数。任务失败后若保留工位等待原位重试，仍计入占用；不要因为处理暂时暂停就显示工位已释放。

action 取 idle、enqueue、dequeue、process、read、write、retry、reject、error 或 complete。active 和 edges 继续表示该步骤正在强调的部件与连接；状态快照提供确切数量。不要假设被点亮就代表成功。

## 图形与读数

- 料仓按 queueDepth 显示工单；capacity 超过 16 时用按比例填充的料堆，精确数量看读数。
- 工位槽按 concurrency 显示，按 activeWorkers 点亮占用槽；不把等待任务算作占用工位。
- 重试拨盘从 0 转到 retryLimit；必须在部件说明中声明是哪项任务的重试计数。
- 详情同时显示上一步和当前步骤的数量，错误与拒绝部件使用错误状态。
- Trace 模式只用实际 span 驱动活动。没有明确采样语义的普通 span 不足以推算队列长度、在用工位或重试次数，机械快照显示未知。

## 验收

使用 assets/examples/queue-retry.json 查看完整场景。检查队满时新增任务被拒绝且等待数不变；两个任务出队后等待数减少 2、运行数增加 2；任务 A 仅重试一次，再失败后退出；任务 B 完成后释放工位。来回拖动到这些步骤，图形和读数须始终一致。

真实项目可用独立的合成场景解释机制，再用实际 Trace 排障。不要将教学快照和测量记录混作同一组实测数据。
