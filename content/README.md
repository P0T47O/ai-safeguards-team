# 内容编辑入口

`content/` 是案例与排期的源文件。日常修改从这里开始；`dist/data/cases.json` 和 `dist/data/campaign.json` 由构建脚本生成。

## 修改什么，打开哪里

| 修改内容 | 文件 |
| --- | --- |
| 弗洛伊德 AI 的对话、降智反转或评分 | `cases/OC-111.json` |
| 第十天增强风控的案卷顺序、通告、权限、工时 | `days/day-10.json` |
| 某个普通案例的姓名、城市、用量或模板参数 | 对应的 `cases/OC-编号.json` |
| 普通任务共用文案 | `templates/routine-scenarios.json` |
| 蒸馏任务共用文案 | `templates/distillation-templates.json` |
| 城市、时区、币种等共用资料 | `cities.json` |
| 班次文件顺序、全局奖励、动作、材料类别 | `campaign.json` |
| 最后一天裁撤部门通知的标题、正文与落款 | `campaign.json` 的 `ending` |
| 猫娘事件链的替换账号与前次处置对应的续接对话 | `chains/catgirl-project.json` |

总裁账号的执行保护由三份案例的 `executionPolicy` 配置。玩家可选择封禁／降智，但执行被权限拒绝；不填写虚构的已执行降智样例。

## 两种案例源文件

### 完整手写案例

手写案例直接保存完整案卷，含 `id`、人物、`documents`、`reply`、`messages`、`poisonSample`（选填）与 `assessment`。单个文件就是案卷本身，不包裹 `cases` 数组。字段含义见 `../docs/case-format.md`，运行包格式参考 `../dist/data/content.schema.json`。

修改后续剧情只改对应的 `messages` 分支；修改降智输出改 `poisonSample`。材料 ID 与评分引用保持对应，已有 ID 尽量保留。

“降智”表现不稳定、时神时鬼，偶尔比正常模型更优秀；这是橙蟹的处置名称，不保证能力上限下降。保留编剧、机器人、弗洛伊德等特殊反转，后果只在处置后揭示。

### 模板案例

模板案例保存独立的生成参数，含 `id`、`kind`、`scenarioId`、姓名、城市、设备、用量等。`kind` 为 `ordinary`、`distillation`、`region` 或 `identity`。采集类型还指定 `templateId`。构建时补齐完整材料与评分，生成结果带 `authoring` 方便追踪；源文件不需要这个字段。

如需把模板案改成独立剧情：从运行包取出该案完整对象，移除 `authoring`，替换同名的案例源文件。保留原案卷和证物 ID，原有每日排期无需修改。

## 增加案例与班次

1. 在 `cases/` 新建 `OC-编号.json`，文件名必须与 `id` 一致。
2. 将 ID 追加到对应 `days/day-编号.json` 的 `caseIds`，按需调整工时预算。
3. 执行 `npm run build:content`，刷新本地游戏。

每天的文件保存该阶段完整配置：`id`、`day`、标题、通告、材料权限、`caseIds`、基础工资与工时。模板案的日期根据排期生成，因此必须有且只有一个班次；完整手写素材可暂不排期。

新建班次时，再将班次文件名（不含 `.json`）追加到 `campaign.json` 的 `stages`。顺序就是游戏中的日期顺序，`day` 必须连续。

## 构建与预览

```powershell
npm run build:content
npm run dev
```

`npm run generate:campaign` 保留为同一个构建命令的别名。`npm run dev` 会先构建内容；服务器已启动时，修改内容后手动运行构建并刷新。

构建只从 `content/` 读取案卷来源，不从旧运行包提取手写正文。会检查文件名、引用、重复排期、材料、评分与分支；任何内容校验失败都发生在写入运行包之前。同时自动更新当前排期表，输出不变时不重写文件。此命令不运行自动化测试。

## 当前排期与存档

当前为二十日、115 案，材料分三阶段，在第 1、2、10 天开放。第十天前不要把身份缓存或必须查银行／税单的案卷排进队列。完整顺序见构建自动生成的 `../docs/campaign-schedule.md`，故事链与存档说明见 `../docs/twenty-day-campaign.md`。

`campaign.json.caseChains` 保存 `chains/` 下文件标识列表，构建时展开成完整事件链配置。链内案卷可以使用 `{{name}}`、`{{accountId}}` 等账号占位符及 `{{followUp}}`。详情见 `../docs/catgirl-chain.md`；不要直接替换运行包或在 UI 中写死后续账号。

本轮重排使用独立的二十日存档，旧十五日进度保留；不要把旧队列直接套用新排期。

## 首次拆分的迁移记录

本次迁移保留 15 天、110 案，以及全部 ID、证物、文本、评分与排期。生成的两个运行包与迁移前逐字节一致，不更换 `campaign.id` 或本机存档键。

作品说明可继续写在 `docs/`，具体对话、数值和分支以案例源文件为准。不要在多个文件中维护同一份可执行案卷。
