# 跳舞兰AI花店 · H5

> 当前交付版本：**1.0.4**。域名停用期间测试入口：`http://129.204.85.139/`；域名恢复后使用 `https://h5.tiaowulan.com/`。
> 当前文档 HEAD：`896e1d1`；功能基线提交：`e4487c2`。版本记录见 [`CHANGELOG.md`](./CHANGELOG.md)，发布规范见 [`docs/RELEASE_PROCESS.md`](./docs/RELEASE_PROCESS.md)。

AI 驱动的线上花店 H5，提供选花、下单、店铺浏览与 AI 花艺顾问一站式体验。技术栈 **Vue 3 + Vite + Sass**。

数据层采用「开发 mock + 生产 Node API / 商家服务桥接」双轨：
- 本地开发可使用 `src/mock/` 假数据；
- 生产通过 `server/` 的 `/api` 与商家服务桥接访问真实商品、用户和订单链路；关键写操作不得静默回退 mock。

AI 花艺顾问已接入**自研智能体平台 `https://api.tiaowulan.com`**（流式输出 + 结构化卡片）。

交付边界：H5 负责展示和交互；智能体负责理解、事实查询、DIY 方案和生图任务；商家后端负责商品、订单、支付和履约。DIY 方案当前不是现成 SKU，不直接进入现货结算。

## 交付方 AI 快速阅读

1. 先读本 README、`CHANGELOG.md` 和 `docs/RELEASE_PROCESS.md`。
2. 顾问链路重点看 `src/pages/Advisor.vue`、`src/components/AdvisorCards.vue`、`src/components/AdvisorDiyCard.vue`、`src/utils/diyPlan.js`。
3. 智能体接口和生图契约看智能体仓库 `DELIVERY.md`、`docs/05-前端对接契约.md`。
4. 生产静态目标是 `/opt/twlh5-h5/dist`；发布只重启 `twlh5-static`，不要为静态发布重启 `twlh5-api` 或 `flower-shop`。

## 快速开始

```bash
# 前端
npm install
npm run dev          # http://localhost:5180（沙箱端口被占用会自动顺延）
npm run build        # 产物输出 dist/（沙箱多次构建另用 dist-v*，已被 .gitignore）

# 可选：同时起前端 + 后端（需先装后端依赖）
npm run dev:all

# 后端（MySQL 只读，需先装依赖）
cd server && npm install && npm run start   # 默认 http://localhost:4000
```

## 前端开发约定（重要）

### 1. 尺寸：rpx → rem

本项目采用 **750 宽设计稿**。`1rem = 容器宽度`（上限 480px，见 `index.html` 的 `setRem`），因此：

```
n rpx = n / 750 rem
```

写样式用 Sass 函数 `rpx()`：

```scss
.card { width: rpx(280); }   // → 0.3733rem → 375 屏上 = 140px
```

> `rpx()` 由 `vite.config.js` 的 `additionalData` 全局注入，任何 `.scss` 和 `<style lang="scss">` 里都能直接用。
> **例外**：CSS 自定义属性（`--xxx`）的值 Sass 不计算，必须用 `calc(n * var(--rpx))`，见 `src/styles/tokens.scss`。

### 2. 字号：不用变量，直接写数值

项目按出现频率固化了一套字号约定（不引入变量，直接写数值）：

| 用途 | rpx | 字重 |
|---|---|---|
| 大标题 / 价格 | 40 / 48 | 700 |
| 标题、按钮 | 28 | 600 |
| 正文 | 26 | 400 |
| 次要说明 | 24 | 400 |
| 辅助、标签 | 22 / 20 | 400 |

字重只有三档：**400 / 600 / 700**。

### 3. 图标：emoji + CSS 伪元素，没有 iconfont

项目不依赖图标字体，全部用 emoji（🌸 ⌖ ⌂ ⭐ ✓ ↗ 等）+ CSS 伪元素画的线稿（4rpx 描边 + `currentColor`），统一维护在 `src/styles/base.scss` 的「线稿图标」区：`line-search-mark` / `location-pin` / `arrow-back` / `arrow-down` / `arrow-right`。

### 4. 布局约定

- 页面根容器 `.twd-app`：移动端居中，宽度上限 480px
- 横向滚动：`overflow-x: auto` + `white-space: nowrap`；轮播图用 `scroll-snap-type: x mandatory` + 定时器自动播放
- 底部固定操作栏：需额外 `left: 50%; transform: translateX(-50%); width: 1rem`，否则会以视口为基准、和居中的 `.twd-app` 容器错位
- 图片用 `FlowerImage.vue` 包一层，`<img>` 加载失败降级为 emoji

### 5. 商品图降级

商品图走 `FlowerImage` 的 emoji 降级。接入真实图片 URL / CDN 后自动恢复正常。

## 目录

```
.
├─ index.html              # setRem（1rem = 容器宽，上限 480px）
├─ vite.config.js          # @ 别名；/agent 与 /api 代理；build.emptyOutDir:false
├─ package.json            # 前端脚本
├─ src/
│  ├─ main.js / App.vue
│  ├─ styles/              # _rpx.scss(rpx() 函数) tokens.scss(设计 token) base.scss(reset+工具类+线稿图标)
│  ├─ components/          # TabBar NavBar FlowerImage GoodsCard
│  │                      #   AddressManager AddressPicker AdvisorCards
│  ├─ pages/               # Home(首页) Detail(详情) Cart(购物车) Category(分类)
│  │                      #   Checkout(结算) Orders(订单列表) OrderDetail(订单详情)
│  │                      #   ShopDetail(店铺详情) Shops(全部花店)
│  │                      #   Profile(我的/个人中心) Login(登录) Settings(账户设置) Advisor(顾问)
│  ├─ mock/                # data.js(内置 mock 数据) api.js(含 realApi 真实接口层) regions.js(省市区)
│  ├─ store.js             # 购物车 / 地址 / 登录态（localStorage 持久化）
│  └─ router/index.js
└─ server/                 # Node 只读后端（MySQL），持有库连接，供前端 /api 调用
   ├─ package.json
   ├─ src/                 # index.js(db 路由) db.js(连接池) mapping.js(行→前端字段映射)
   └─ sql/users.sql        # users 表建表模板（幂等）
```

## 页面清单（已完成）

| 页面 | 路由 | 内容 |
|---|---|---|
| 首页 | `/` | 定位栏、搜索栏、Banner 轮播、同城花店横滑、场景分类、推荐花束；「更多花店 ›」跳 `/shops`；Banner 下入口卡进顾问页 |
| 全部花店 | `/shops` | 花店列表，卡片点击进 `/shop/:id` |
| 分类/选花 | `/category` | 搜索（花束+花店）、分类 Tab、综合/销量/价格排序、两列网格、直接加购 |
| 商品详情 | `/detail/:id` | 大图、价格区、适合场景、花材、花语、描述、服务承诺、商品信息、底部操作栏（含「立即购买」→结算、「花艺顾问」→`/advisor`、分享 `navigator.share`/剪贴板） |
| 购物车 | `/cart` | 按店铺分组、步进器、删除、空状态、店铺头点击进店铺详情、底部结算栏 |
| 结算 | `/checkout` | 配送/自提切换、收货信息（触发地址管理）、配送时段、贺卡、备注、费用明细、提交建单并清购物车跳订单详情 |
| 订单列表 | `/orders` | 8 Tab（全部/待付款/制作中/配送中/已完成/待评价/退款），「再来一单」→加购跳购物车 |
| 订单详情 | `/order/:id` | 状态卡、配送信息、商品、费用、单号复制、评价区、联系骑手 `tel:` |
| 店铺详情 | `/shop/:id` | hero、联系信息（地址复制/电话拨打/微信复制）、四 Tab、底部购物车栏 |
| 我的（个人中心） | `/profile` | 登录态（`requiresAuth` 守卫）；订单快捷入口；收货地址弹窗；「账户设置」→`/settings`；「联系客服」弹窗（电话 `tel:`）；退出登录 |
| 登录 | `/login` | 手机号验证码 + 微信一键登录双路径（微信内检测走网页授权，无 appId 走 mock）；协议勾选 + 服务/隐私弹窗 |
| 账户设置 | `/settings` | `requiresAuth`；改昵称/性别/头像（10 个 emoji 预设 + 自定义图片 URL），手机号只读打码；`store.updateUserInfo` 持久化 |
| 地址管理 / 选择 | AddressManager / AddressPicker | 省市区三级联动三步弹窗；地址列表（新增/编辑/删除/设默认）存 localStorage；首页定位栏、结算页收货地址均触发 |
| AI 花艺顾问 | `/advisor` | 流式聊天（SSE）+ 8 类结构化卡片（方案/订单/店铺/支付/生图/贺卡/选项）+ 多会话管理（见下节） |

底部 TabBar（首页 / 购物车 / 我的）已完成，购物车角标与详情页加购实时联动。

## Node 后端 `server/`

持有 MySQL 与商家服务连接，前端经 `/api` 同源代理调用，账号密码和服务令牌只在服务端，浏览器不持密钥。

- **技术**：Express + `mysql2`（连接池，SSL `rejectUnauthorized:false` 仅加密不校 CA）
- **端口**：`API_PORT`，默认 `4000`（与 `vite.config.js` 的 `/api` 代理目标一致，`API_PROXY_TARGET` 可覆盖）
- **只读接口**：`/api/health`、`/api/meta/tables`、`/api/meta/columns?table=`（schema 发现）、`/api/home`、`/api/flowers`(+`/:id`)、`/api/categories`、`/api/shops/:id`(+`/reviews`)、`/api/search?q=`、`/api/users`（脱敏）
- **兜底边界**：开发读接口可以回退 mock；登录、订单、支付、退款等生产写链路必须明确失败，不得伪造成功。
- **真实库 schema（已通过智能体核实）**：仅 3 张表 `products` / `shop_products` / `shops`；`products` 列含 `name/subtitle/description/price/original_price/stock/sales/rating/image/images/tags/flowers/flower_meaning/season/shelf_life/owner_shop_id`，价格单位为**元**。当前 `server/src/mapping.js` 按 `flowers/categories/reviews/orders` 假设字段，连真库时需按这 3 表重写（部署前先 `GET /api/meta/tables` + `/api/meta/columns` 校准）
- **用户表模板**：`server/sql/users.sql`（`CREATE TABLE IF NOT EXISTS users`，幂等），对应只读 `GET /api/users` 经 `mapUserRow` 脱敏（手机号 `138****8888`、openid 掩码、密码/令牌不返回）
- **白名单**：MySQL「允许来源」为 `8.138.203.6`。`server/` 须跑在该机或把本机 IP 加入白名单，否则连不上库（前端回退 mock）。本机 `node server/src/index.js` 验证：`GET /api/health` 显示 `dbConnected`

## AI 花艺顾问对接说明（自研智能体平台）

- **平台**：当前域名停用时使用 `https://49.232.49.176`；域名恢复后可切回域名（ReAct 架构，UI 契约 `/ui-contract`）
- **鉴权**：`X-API-Key`（平台 Key，存前端 `.env` 的 `VITE_AGENT_API_KEY`）→ `POST /auth/token` 换 Bearer token
- **流式输出**：`POST /chat/stream` 返回 `text/event-stream`，事件四种：
  - `tool_call {name,status}`（如 `platform_db_query_entity`，页面显示「正在查询花库…」）
  - `text {content}`（多次增量，前端打字机渲染 + 闪烁光标）
  - `card {ui,data}`（结构化卡片，见下）
  - `done {session_id}`
  - 中断用 `AbortController`「停止」按钮；失败则回退旧版一次性 `chatWithAdvisor`（含 mock 演示）
- **8 类结构化卡片**（`src/components/AdvisorCards.vue` 渲染，字段兼容「契约示例」与「平台实际返回」双形态）：
  - `plan_card` 方案卡：横向滚动，图/名/价/库存/店铺，「加购 / 购买」→ 购物车或结算
  - `order_card` 订单卡：明细/合计/方案标签，「确认下单 / 查看订单」
  - `shop_card` 店铺卡：评分/距离/价位，「选这家」=把选择回传给智能体
  - `pay_jump` 支付卡：订单号 +「去支付」
  - `image_task` 生图任务：自动轮询 `/tasks/{id}`，出图前脉冲进度
  - `greeting_card` 贺卡：大图 + 文案 + 收/送人，「换一张 / 改文案」
  - `dialog_options` 选项 chips：点选回传继续对话
  - `text` 文本气泡
- **多会话管理**：`Advisor.vue` 左侧抽屉 `≡` 管理，会话存 `localStorage`（`twd_advisor_convos`，最多 30 个会话、每会话最多 40 条）；支持新建 / 切换 / 重命名（prompt）/ 删除；首条用户消息自动命名，发送后写回 `updatedAt`/`sessionId`/`agentMode`
- **开发态**：`vite.config.js` 配 `server.proxy['/agent']` → 可配置的智能体地址，H5 走同源 `/agent/*` 免浏览器 CORS，key 不进 bundle
- **生产态**：通过 H5 服务端 / Nginx 同源代理访问 `/agent`；浏览器不直接持有平台 Key。不要把生产 Key 写入构建产物。

## 环境变量 `.env`

`.env` 与 `.env.example` 均被根 `.gitignore`（`.env.*`）忽略，不进仓库。变量清单：

**前端 `.env`**
| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_AGENT_API_KEY` | 智能体平台 Key（即 `X-API-Key` 的值） | — |
| `VITE_AGENT_API_BASE` | 顾问接口基址；开发用 `/agent`（代理），生产可设 `https://api.tiaowulan.com` | `/agent` |
| `VITE_USE_REAL_API` | `'true'` 启用 `server/` 只读后端；缺失/`'false'` 全走 mock | `false` |

**后端 `server/.env`**
| 变量 | 说明 | 默认 |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | MySQL 只读账号 | `118.25.21.45` / `3306` / `flower_shop` / `ai_readonly` / — |
| `DB_SSL` | 是否启用 SSL 加密 | `true` |
| `DB_PRICE_UNIT` | 价格单位 `yuan` / `cents` | `yuan` |
| `TBL_USERS` 等 | 表名覆盖（默认按 `users` 等推断） | — |
| `API_PORT` | 后端监听端口 | `4000` |

## 待办 / 已知限制

- **真实数据**：`server/` 只读接口已接，但仅当后端跑在 MySQL 白名单机器（`8.138.203.6`）或本机 IP 加入白名单时才连真库；否则前端回退 mock。生产二选一：把 `server/` 部署到白名单机器，或白名单加本机 IP。`server/src/mapping.js` 需按真实 3 表（`products`/`shop_products`/`shops`）重写方能对齐真库。
- **智能体生产接入**：当前使用同源 `/agent` 代理；不要改成浏览器携带生产 API Key 直连。
- **订单链路**：H5 Node API 已通过服务间登录桥接商家后端；生产改动和补丁见 `deploy/patches/`。静态前端发布不得重启或改写商家服务。
- **库内现多为测试数据**：经智能体核实，`products` 表中存在「随机花瓶一个」「测试」等样例行，接真库后替换即可。
- **DIY 成交**：当前 DIY 卡支持复制后端提供的 `copy_text` 用料清单；尚未接平台定制订单、付款和分账接口。
- **AI 生图**：真实 DIY 方案由后端同一轮提交生图任务，前端轮询 `task_id/poll`；前端不再从自然语言猜 DIY 卡。

## 环境坑

1. **沙箱 safe-delete 拦截删除 `dist`**：WorkBuddy 的 safe-delete（命令级 hook）拦截一切删 `dist` 操作——`vite build` 的 `emptyOutDir`、手动 `rd`/`del`、`node fs.rmSync` 全被拦（fail-closed 不真删）。已设 `vite.config.js` 的 `build.emptyOutDir: false`；本机验证用 `npm run build -- --outDir dist-build` 绕道（输出到全新目录）。`npm run preview` 会锁 `dist` 句柄，构建/删 `dist` 前务必先结束预览进程。`dist-v*` 等沙箱多次构建产物已被 `.gitignore`。本机直接 `npm run build` 不受影响。
2. **Sass 注释里别写 `#{}`**：会被当成插值解析报 `Expected expression`。
3. **沙箱端口占用**：`npm run dev` 若 5180 被旧实例占用会自动顺延（5181/5182…），带 `/agent`+`/api` 代理的才是新实例；本机正常 `npm run dev` 直接绑 5180。
