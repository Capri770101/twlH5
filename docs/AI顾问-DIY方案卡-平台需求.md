# AI 顾问 DIY 方案卡 — 平台侧需求

> 接收方：智能体平台同事
> 提单方：跳舞兰 H5（前端 `https://h5.tiaowulan.com`）
> 日期：2026-09-10
> 优先级：P1（线上 AI 顾问 DIY 场景无结构化方案卡，目前只有纯文本气泡，体验缺失）

---

## 一、现状与痛点

我方已对接智能体平台（`POST /chat/stream`），前端已实现 6 种结构化卡片渲染（`plan_card` / `order_card` / `shop_card` / `pay_jump` / `image_task` / `greeting_card` / `dialog_options`）。

**用户场景**：用户在 H5 AI 顾问里说"我想 DIY 一束花送女朋友生日，预算 300 元"，平台理应调用 `generate_diy_plan` 工具生成方案。

**实测问题**（2026-09-10 我方真实 curl SSE 抓包）：

```
[00] event='tool_call' data={"name": "generate_diy_plan", "status": "ok"}
[01] event='tool_call' data={"name": "generate_effect_image", "status": "ok"}
[02-07] event='text' data="给你设计了「粉黛浪漫·生日惊喜花束」💐 粉色绣球打底..." (一段自然语言)
[08] event='done'
```

**9 个事件里 0 个 `card` 事件**。`generate_diy_plan` 工具虽然调成功了，但平台没把结构化数据推给前端。前端收到的只有一段自然语言文本，无法渲染"DIY 方案卡"。

**用户体验后果**：
- ❌ 没有效果图大图（效果图只在 `tool_call(generate_effect_image)` 后被丢弃）
- ❌ 没有花材清单/预算明细可视化
- ❌ 没有"加购""保存到我的方案"按钮
- ❌ 没有养护贴士/贺卡建议的独立展示
- ❌ 用户看到的就是一段普通文字回复，跟"打开 ChatGPT 问了一下"没区别

---

## 二、期望行为

在 `generate_diy_plan` 工具调用成功之后，立即追加 emit 一个 `card` 事件，前端会自动渲染 DIY 方案卡。

**事件顺序**（DIY 场景）：

```
1. event='tool_call'    { name: "generate_diy_plan",     status: "ok" }   ← 已有
2. event='tool_call'    { name: "generate_effect_image", status: "ok" }   ← 已有
3. event='card'         { ui: "diy_plan_card", data: { ... 见下方契约 ... } }   ← 新增
4. event='text'         "给你设计了「XXX」💐 ..."   ← 已有
5. event='text'         "。"   ← 已有
6. ...
N. event='done'
```

**期望用户看到**：
1. 思考中提示 + 「正在生成 DIY 方案…」+「正在生成效果图…」
2. 一张精美的方案卡：大图（效果图）、方案名、描述、价格、花材 chips、预算明细表、养护贴士、贺卡建议（可一键复制）、加购/保存按钮
3. 后续自然语言补充说明

---

## 三、字段契约（`card` 事件 → `data`）

### 3.1 事件框架

```json
{
  "ui": "diy_plan_card",
  "data": {
    "plan_id": "diy_xxx",
    "name": "粉黛浪漫·生日惊喜花束",
    "desc": "粉色绣球打底，非洲菊提亮，搭配满天星",
    "price": 300,
    "effect_image_url": "https://...",
    "materials": [...],
    "budget": [...],
    "skill_level": "新手",
    "suitable_for": "生日 / 求婚 / 纪念日",
    "care_tips": "每隔 2 天换水...",
    "greeting_suggestion": "今天是特别的一天..."
  }
}
```

### 3.2 字段明细

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `plan_id` | string | ✅ | 方案唯一 ID（用于前端"保存到我的方案"/"加购"关联）；建议带 `diy_` 前缀方便识别 |
| `name` | string | ✅ | 方案名，建议 4~14 字（含 emoji 也可，如「粉黛浪漫·生日惊喜花束 💐」） |
| `desc` | string | ⭕ | 一句话描述，0~40 字；为空则前端不渲染 |
| `price` | number | ✅ | 预估总价，**单位元**（浮点，如 `300` 或 `299.5`）；前端会做容错，收到整数 30000 也会按 300 显示 |
| `effect_image_url` | string | ✅ | AI 生成的方案效果图（建议 750×600 以上 jpg/png）；可为空字符串，前端会显示占位 |
| `materials` | array | ⭕ | 花材清单，每项见下表 |
| `budget` | array | ⭕ | 预算明细，每项见下表 |
| `skill_level` | string | ⭕ | 难度：建议 `新手` / `进阶` / `高阶`；前端会做配色区分 |
| `suitable_for` | string | ⭕ | 适用场景，自由文本（如 `生日 / 求婚 / 纪念日`） |
| `care_tips` | string | ⭕ | 养护贴士，0~120 字 |
| `greeting_suggestion` | string | ⭕ | 贺卡文案建议，0~80 字；前端会提供"一键复制"按钮 |

### 3.3 子对象契约

**materials（花材清单）**

```json
[
  { "name": "粉色绣球", "qty": 3, "unit": "支", "price_yuan": 18 },
  { "name": "非洲菊",   "qty": 5, "unit": "支", "price_yuan": 6  },
  { "name": "满天星",   "qty": 1, "unit": "束", "price_yuan": 15 }
]
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 花材名 |
| `qty` | number | ✅ | 数量（建议整数） |
| `unit` | string | ⭕ | 单位（默认 `支`） |
| `price_yuan` | number | ⭕ | 单价（元），用于"小计 = qty × price_yuan"展示 |

**budget（预算明细）**

```json
[
  { "label": "主花",   "amount_yuan": 120 },
  { "label": "配花",   "amount_yuan": 80  },
  { "label": "包装",   "amount_yuan": 50  },
  { "label": "人工",   "amount_yuan": 50  }
]
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `label` | string | ✅ | 明细项名（主花/配花/包装/人工/其他...） |
| `amount_yuan` | number | ✅ | 金额（元） |

建议 `sum(budget[*].amount_yuan) ≈ price`（允许 ±10% 偏差，反映实际花材单价浮动）。

---

## 四、兜底与兼容

1. **`plan_id` 缺失**：前端会用 `name + Date.now()` 兜底生成，但会丢失"保存到我的方案"能力——请尽量传。
2. **`effect_image_url` 为空**：前端显示 `💐` 占位 + 「效果图生成中」提示，仍渲染其他字段。
3. **`materials` / `budget` 为空**：前端只显示方案名/描述/价格 + 贺卡建议，其余字段不渲染。
4. **`price` 是整数（猜成"分"）**：前端会做 `price > 1000 ? price/100 : price` 兜底，但建议严格按"元"传。
5. **同一对话多次 emit diy_plan_card**：前端会全部渲染（用户可能问"再出一个方案"）。无需去重。

---

## 五、验收用例

### 用例 1：标准 DIY 请求

**用户输入**：`我想 DIY 一束花送女朋友生日，预算 300 元`

**期望平台响应**：

1. `tool_call` `generate_diy_plan` + `generate_effect_image`
2. **`card` 事件** `ui=diy_plan_card`，data 含完整字段（plan_id/name/desc/price/effect_image_url/materials/budget/skill_level/suitable_for/care_tips/greeting_suggestion）
3. 后续 `text` 自然语言补充说明

**期望 H5 渲染**：方案卡大图 + 方案名 + 价格 + 花材 chips + 预算明细表 + 养护贴士 + 贺卡建议（一键复制）+ 加购按钮

### 用例 2：极简 DIY 请求

**用户输入**：`DIY 一束 200 元的花`

**期望**：仍 emit `diy_plan_card`，但 `materials/budget/skill_level/suitable_for/care_tips/greeting_suggestion` 字段可能为空或部分缺失——前端按兜底规则渲染。

### 用例 3：用户问"再出一个方案"

**用户输入**：`再出一个方案，颜色用红色`

**期望**：平台基于新条件**再次 emit** 一次 `diy_plan_card` 事件（不要做覆盖/合并），前端会渲染第二张卡。

---

## 六、联调方法（我方已就绪）

**前端**：已实现 `ui="diy_plan_card"` 渲染（commit 待发，部署可由我方一键完成）。

**模拟平台返回**（我方已在 SSE 流里放过 `plan_card`，格式可参考 `plan_card` 事件，详见下方）：

```json
// 已支持的 plan_card 事件格式（仅现货方案用）
{
  "ui": "plan_card",
  "data": {
    "plans": [
      { "id": "p1", "name": "...", "price": 199, "image": "...", "desc": "...", "merchant_name": "..." }
    ]
  }
}
```

**DIY 方案卡是新增类型**（`ui="diy_plan_card"`，data 结构见第三节），与 plan_card 互不影响。

**线上验证方法**：

1. 部署后访问 `https://h5.tiaowulan.com/advisor`（H5 AI 顾问页）
2. 登录态任意（游客即可）
3. 输入"DIY 一束生日花 300 预算"
4. 期望：气泡下出现一张 diy_plan_card，含效果图/花材/预算/贺卡建议

---

## 七、ETA 与沟通

- **我方**：前端已写好 `diy_plan_card` 渲染，部署 ≤ 1 天可完成（不需要等平台，先发版）
- **平台侧**：希望 1 周内上线 emit `card` 事件；如需对齐字段细节，可随时在群里 ping 我
- **临时方案**：若平台短期无法上线，我方会在前端加一层"启发式提取"（从 text 里抽方案名/价格/花材），但精度有限——能改平台最好改平台

---

## 附：我方联系方式

- 对接人：木木
- H5 域名：`https://h5.tiaowulan.com`
- 前端仓库：`Capri770101/twlH5`（Vue3 + Vite）
- 后端仓库：`/opt/twlh5-server`（Express，业务 API 适配层 `server/src/store.js`）
