# Agent Anatomy v2.0.0

使用 [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) 的完整绘图库、制作流程和验收标准，把技术机制做成精密、可交互的等轴测机械图。默认中文、浅色、离线单 HTML。

v2 完整保留原版的 SVG、WebGL、3D、React 支持，八组示例、工艺规范、截图工具和几何审计。v1 的节点网格界面保留为独立 Trace Explorer，不再作为默认的机械图生成器。

![原版 Anatomy 的指示表示例](assets/upstream-gallery/dial-indicator.webp)

上图是随仓库保留的原版示例截图，来自 Ryan；对应可交互页面为 [dial-indicator-light.html](examples/dial-indicator/dial-indicator-light.html)。新主题需要按同一流程定制机器并验收，安装相同代码不等于任意新图自动达到该水准。

## 直接查看原版效果

需要 Node.js 22 或更高版本。构建器只依赖 Node 内置模块，无需 npm install。

```bash
git clone https://github.com/kejun/agent-anatomy.git
cd agent-anatomy
node examples/dial-indicator/build.mjs --light
```

用浏览器打开 examples/dial-indicator/dial-indicator-light.html。八组示例完整保留在 examples/ 中；六组框架无关示例已包含可直接打开的 HTML。

| 示例 | 能力 |
| --- | --- |
| dial-indicator | 指示表、滑台、测量针与实时读数；纯 SVG |
| desk-computer | 精细电脑与可输入的键盘、CRT；纯 SVG |
| arcade-cabinet | 街机剖面、投币通道、开关和线缆；纯 SVG |
| raptor-engine | 发动机、密集管路、拆解和 WebGL 喷焰 |
| ripple-tank | 水槽、波与光学效果；SVG + WebGL |
| turning-dial | 真正转动的 3D 拨盘和机械手；原版 beta |
| test-rig | 试验台、弹簧、探针和表盘；React 示例 |
| spot-plate | 点滴合并与量规；React 示例 |

## 作为 Skill 使用

本仓库根目录就是技能目录，入口为 [SKILL.md](SKILL.md)。保留 kit、examples、references、scripts、assets 和 agents 等目录；不要只复制提示词。

可以把仓库地址交给你的 Agent，要求安装 agent-anatomy。目录安装示例：

```bash
# Codex 的用户技能目录（遵循当前客户端的技能发现配置）
git clone https://github.com/kejun/agent-anatomy.git ~/.agents/skills/agent-anatomy

# Claude Code 的项目技能目录
git clone https://github.com/kejun/agent-anatomy.git .claude/skills/agent-anatomy
```

示例请求：

> 用 agent-anatomy 解释连接池：6 个连接，8 个请求，借不到的先等待，归还后再分配。按原版 Anatomy 的制作标准，做成一台可以操作的精密机器，中文、浅色、单 HTML。

> 用 agent-anatomy 解剖这个项目。先核实代码，选择关键机制设计完整机器，保留事实来源，按原版标准检查整体、手机和四倍局部。

这些说明提供使用方式，不代表所有 Agent 客户端、浏览器和实体设备均已完成验收。

## 生成与验收原则

1. 先核实概念和数值，再设计能解释机制的物体。
2. 先列零件表，再用原版 kit 建模；主体、支撑、装配和连接件都有作用。
3. 同一模型驱动机械动作、读数和说明。
4. 原版流程要求几何审计、线端检查、桌面与手机截图、4× 局部，并与原版示例并排审视。
5. 代码事实、推断、未知和合成演示分开。缺少真实 Trace 时不补造延迟、调用量或运行状态。

完整规则见 SKILL.md 和 references/craft.md。新主题在任务目录编写自己的 build.mjs，原版文件保留不变。

## Trace Explorer

需要分页检索、业务域筛选、父子 span 导航和原始错误检查时，使用 [兼容工具说明](references/trace-explorer.md)：

```bash
node scripts/render.mjs --input /absolute/path/model.json --trace /absolute/path/trace.json --out /absolute/path/trace-explorer.html
```

它沿用 v1 的预制节点图，用于记录检索。精密机械解释图通过 kit 制作，不通过该命令生成。

## 验证

```bash
npm test
npm ci
npx playwright install chromium
npm run test:browser
npm run test:upstream
npm run build:examples
```

- npm test：逐文件核对原版完整性，以及 Trace Explorer 的数据检查。
- test:browser：兼容工具的浏览器交互检查。
- test:upstream：原版全部回归测试；CHROME_PATH 可指定已有 Chromium。
- build:examples：在临时目录重建原版全部独立示例，并核对生成 HTML 与原版基线完全一致，不改写仓库中的示例。

逐字节重建采用与上游 CI 一致的 macOS + Node 22。Linux 下已确认部分三角函数结果的最后一位会不同，影响发动机及 3D 压力示例的序列化字节；因此其他环境运行 build:examples 可能报告哈希差异。仓库内附页面始终保留原版字节，普通构建和使用不受这一环境要求限制。

原版检查需要可正常启动的 Chromium。本仓库不修改上游浏览器脚本以绕过环境限制；受限环境可明确指定自己的浏览器启动包装器。实际远端结果见 [GitHub Actions](https://github.com/kejun/agent-anatomy/actions)。

## 来源与许可

原版基线：[689dcf966e63d92be10a5d593c6e19e10acd4422](https://github.com/wheresryan22/anatomy/commit/689dcf966e63d92be10a5d593c6e19e10acd4422)。

原版作者 Ryan，MIT 许可原文保留在 [LICENSE.anatomy](LICENSE.anatomy)。[upstream.json](upstream.json) 记录移植路径与 SHA-256；123 个原版文件和完整制作正文保留原样。它们包括 kit、八组示例、规范、审计/截图/回归工具、测试夹具、评估任务和原版示例截图。

本仓库在此基础上增加中文使用规则、代码与 Trace 证据约束、技能环境适配和原版一致性检查。上游导入的许可不改变未列入清单的其他代码已有权利。
