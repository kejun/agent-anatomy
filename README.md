# Agent Anatomy

将技术概念、软件架构和执行追踪转成可离线打开的交互式 2.5D SVG 机械解剖图。v1.0.0。

同一份数据驱动图形与读数：料仓显示等待数量，工位显示占用数量，拨盘显示重试次数。Trace 用实际记录点亮活动，并保留错误消息、异常事件和原始输入。

## 能做什么

- Agent、软件架构、AI Pipeline 三个起始模板。
- 业务域比较、当前活动、内部部件下钻及来源检查。
- 完整状态快照驱动排队、并发、拒绝、重试和失败出口；支持前后跳转。
- JSON / JSONL、Chrome Trace X 与配对 B/E、OTLP JSON 导入。
- 记录分页、名称/ID/属性搜索、按 traceId 查看完整处理、父子记录跳转、错误自动定位。
- 单 HTML 内嵌全部样式、脚本、SVG 和数据；运行时不需要网络、模型 API 或服务器。

## 快速运行

需要 Node.js 22 或更高版本。渲染器仅依赖 Node 内置模块，无需 npm install。

```bash
git clone https://github.com/kejun/agent-anatomy.git
cd agent-anatomy
node scripts/render.mjs --template agent --out /tmp/agent-anatomy.html
node scripts/render.mjs --input assets/examples/queue-retry.json --out /tmp/queue-retry.html
```

直接在浏览器打开生成的 HTML。Agent 模板中的“体验 Trace”加载明确标注的合成教学记录。

自己的模型和追踪：

```bash
node scripts/render.mjs --input /absolute/path/model.json --trace /absolute/path/trace.json --out /absolute/path/anatomy.html
```

自然语言和仓库代码由使用技能的 Agent 阅读、核实并整理为 model.json。CLI 是确定性渲染器；Markdown 输入需要一个 anatomy/json 代码块，不直接解析任意自然语言。

## 作为 Skill 使用

本仓库根目录就是技能目录。入口为 [SKILL.md](SKILL.md)，保留 scripts、assets、references 和 agents 目录。

Codex 的个人技能目录：

```bash
git clone https://github.com/kejun/agent-anatomy.git "${CODEX_HOME:-$HOME/.codex}/skills/agent-anatomy"
```

Claude Code 的项目技能目录：

```bash
git clone https://github.com/kejun/agent-anatomy.git .claude/skills/agent-anatomy
```

示例请求：

> 用 agent-anatomy 解释这个系统，先核实实现，再生成可离线打开的机械解剖图。重点展示排队、并发和失败重试，区分代码事实与合成演示。

> 用 agent-anatomy 展示这个 Trace，按业务域划分，并让我找到某个 traceId 的完整处理过程和错误原因。

这些目录说明提供安装方式，不代表已在每个客户端完成端到端认证。客户端还需支持读取技能文件与本地 Node 命令。

## 模型与边界

参阅 [模型与输入](references/model-and-inputs.md)、[机械状态](references/behavior-states.md) 和 [Trace 导入](references/trace.md)。

- 单个输入最多 15 MiB、最多 15,000 条完成 span；记录每页 100 条，可访问全部记录。
- 作者模型最多 40 个业务域、240 个部件，每层每域最多 16 个直接部件。追踪聚合部件有独立额度。
- 回放不是实时采集。未知映射保留在“未归属”；不猜测丢失的调用、状态或成本。
- Trace 活动不等于队列数量。没有明确机械状态快照时，对应读数保持未知。
- 累计耗时包含父子与并行重叠；token 仅求和已记录字段，可能包含父子重复上报。
- v1 使用 SVG 2.5D，不提供 WebGL 或真实 3D。

## 验证

```bash
node scripts/self-test.mjs
npm ci
npx playwright install chromium
npm run test:browser
```

自检覆盖输入、追踪保真、容量边界、父子索引、机械约束、脚本注入防护和目录迁移。浏览器检查覆盖完整处理导航、后段记录、错误定位、队列与重试、桌面和 390px 手机。浏览器测试输出截图和 browser-results.json；默认写入临时目录。

可用 ANATOMY_QA_DIR 指定输出目录；ANATOMY_PLAYWRIGHT_MODULE / ANATOMY_CHROME_PATH 指定已有测试环境。ANATOMY_SINGLE_PROCESS=1 仅用于需要单进程 Chromium 的受限测试容器，不是普通使用要求。

GitHub Actions 在 Node 22、24 上运行模型检查，并运行 Chromium 交互检查。实际远端运行结果以 Actions 为准；本地通过不代表所有客户端或设备已验收。

## 致谢

概念受到 [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) 的启发：用机械对象解释技术机制。本仓库的代码、模板和图形独立编写，并非原项目的完整移植。
