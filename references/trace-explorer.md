# Trace Explorer（兼容工具）

此工具保留 v1 的业务域筛选、节点下钻、完整记录分页、父子导航、错误定位和原始输入检查。它使用预制机械节点，适合日志检索；精密机械图按主 SKILL.md 的原版 Anatomy 流程生成。

只有用户明确需要此检索工具时使用：

```bash
node scripts/render.mjs --input /absolute/path/model.json --trace /absolute/path/trace.json --out /absolute/path/trace-explorer.html
```

模型读取 references/model-and-inputs.md；追踪读取 references/trace.md；教学状态快照读取 references/behavior-states.md。三个 assets/templates/*.json 仅是检索界面与合成回放的起点，不代表项目事实。

```bash
node scripts/self-test.mjs
node scripts/browser-test.mjs
```

这些检查验证兼容工具的数据和交互，不证明精密图形通过了视觉或几何验收。

Trace 最多 15 MiB、15,000 条完成 span，每页 100 条。作者模型最多 40 个域、240 个节点，每层每域最多 16 个直接节点；导入聚合节点有独立额度。未知归属和状态保留为未知。Trace 是已记录运行的回放，不是实时采集器。
