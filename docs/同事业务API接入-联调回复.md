# 接入现有业务 API（aistore.xiangbinmeigui.com）— 联调确认与落地方案

> 背景：同事智能体明确建议 —— H5 不直连 MySQL，优先接现有业务 API。
> 我方完全同意（与我方此前「缺的是 JSON 数据端点」结论一致），并已完成接口实测，本文件为：
> ① 可直接发给同事的确认回复；② 我方内部适配记录。

---

## 一、接口实测结果（2026-09-09，全部 https 直测可达、无需鉴权、`code:0`）

| aistore 端点 | 我方用途 | 返回要点（实测） |
|---|---|---|
| `GET /v1/home/index` | 首页 | `data.{banners[3], categories[12], recommendFlowers[6], nearbyShops[6]}` —— **与我方 /api/home 契约同构** |
| `GET /v1/shops/list` | 门店列表 | `data.list[12]`；每店含 `status:open`、`subMchId`、`profitSharingRatio`、`avatar/cover/rating/monthSales/deliveryTime/businessHours/minOrderPrice/deliveryFee` |
| `GET /v1/shops/detail?id={id}&includeCatalog=1` | 门店详情页 | `data.{shop, products[91@ s001], categories}`；`products` 为店内全量目录（含 status，稀疏） |
| `GET /v1/flowers/list` | 商品列表/搜索 | `data.list` 全量约 1192 条；`status` 稀疏（on 1064 / off 16 / 缺省 112）；含 `shopId/shopName/shopCity` |
| `GET /v1/flowers/detail?id={id}` | 商品详情 | `data` 单商品完整字段 |
| `GET /v1/locations` | 配送区域 | `data.{cities[8], locations[12]}` |

### 关键结论（影响适配）
1. **价格单位=分（cents）**：如 `price:8800` = ¥88、`originalPrice:15800` —— 与我方现有 `DB_PRICE_UNIT=cents` 计价、`mapFlowerRow`（÷100 出 priceText）**完全兼容，可复用映射函数**。
2. **aistore 字段为 camelCase 超集**，`mapping.js` 的 `pick()` 候选 key 已覆盖（`originalPrice/shelfLife/categoryId/flowerMeaning/...`），商品/店铺对象可直接喂给 `mapFlowerRow/mapShopRow`，无需新写映射。
3. **`flowers/list` 分页参数未生效**（page/pageSize/shopId 被忽略，恒返全量）→ 我方在服务端本地过滤+排序+分页；`categoryId` 参数有效。
4. **商品 `status` 字段稀疏**（部分商品无此键）→ 隐藏策略：仅显式 `status==='off'` 视为下架，其余（'on'/缺省）均展示。
5. **home/index 与我方 /api/home 一一对应**，连字段名都相同，几乎直通。
6. 响应头 `Access-Control-Allow-Origin: *` 已全开。
7. **店铺数据自带 `subMchId`（如 s001→1746109516）与 `profitSharingRatio`（10）**——微信支付服务商分账的「订单归属店 → 子商户」映射可直接取自该 API，无需再向同事要表。

---

## 二、发给同事的最终回复（可直接复制）

> 状态口径：适配层**已实施并上线**（2026-09-09），非「待联调」，可直接发。

---

收到，方案完全同意，而且我方已经完成对接并上线了。同步一下进展：

**1) H5 已接上你方业务 API，不直连 MySQL**
H5 域名 `https://h5.tiaowulan.com`，是「静态页 + Node 后端」同域架构，浏览器只访问我方域名，`/api/*` 由我方后端反向代理到你方接口（服务端到服务端，出口 IP `8.138.248.173`），浏览器侧无跨域。你方 `Access-Control-Allow-Origin: *` 已全开，我方直测正常。

**2) 已接入的接口**（6 个，均 `code:0`）：
`/v1/home/index`、`/v1/shops/list`、`/v1/shops/detail?id={id}&includeCatalog=1`、`/v1/flowers/list?categoryId=`、`/v1/flowers/detail?id=`、`/v1/locations`

线上真数据已验证通过：首页推荐/12 分类、在售商品 1176 款（已剔除下架 16 款）、12 家门店、门店店内目录均正常展示，价格「分」口径与我方一致（8800=¥88）。

**3) 三个小提醒**（均不阻塞，供你方参考）：
a) `flowers/list` 的 `page/pageSize/shopId` 参数暂未生效（恒返回全量约 1192 条）。我方已做服务端缓存 + 本地过滤分页，当前无影响；若后续数据量持续增长，建议你方补充分页支持。
b) 部分商品缺 `status` 字段，我方按「仅显式 `off` 隐藏、其余展示」处理，与你小程序口径一致。
c) 你方接口未做限流，但**我方加了服务端 TTL 缓存 + 超时容错**（首页 30s / 店铺商品 60s），不会对你方造成压力。

**4)** 后续你方若有鉴权、限流、接口变更，请提前同步，我方配合调整。谢谢！

---

## 三、我方落地方案（代码层，待确认后执行）

> **执行状态：已于 2026-09-09 实施并部署上线**（`server/src/store.js` + `index.js` 读源开关 `READ_SOURCE=api` 默认；.env 注入 READ_SOURCE/DB_PRICE_UNIT=cents/STORE_API_BASE；服务已重启）。公网 https://h5.tiaowulan.com 复核：home 真数据（向阳而生 ¥108）、商品在售 1176 款、店铺 12 家（含 subMchId）、s001 店内 90 款在售、搜索正常。旧直连 MySQL 逻辑保留于 `READ_SOURCE=mysql` 可随时回退。

- 新增 `server/src/store.js`：aistore HTTP 适配层（`STORE_API_BASE` 可配，默认 `https://aistore.xiangbinmeigui.com`；Node fetch + 超时；内存 TTL 缓存：home 30s / shops 60s / flowers 60s）。
- `server/src/index.js` 读接口加数据源开关 **`READ_SOURCE`**：`api`（默认，新方案）| `mysql`（保留旧直连逻辑，可随时回退）。
  - `/api/home` ← `/v1/home/index`（映射后直通）
  - `/api/categories` ← home 的 categories
  - `/api/flowers` ← `/v1/flowers/list?categoryId=`（本地过滤 off→排序→分页）
  - `/api/flowers/:id` ← `/v1/flowers/detail?id=`
  - `/api/shops` ← `/v1/shops/list`
  - `/api/shops/:id` ← `/v1/shops/detail?id=&includeCatalog=1`（products 按 `shop.flowers` 顺序排）
  - `/api/search` ← 本地过滤 flowers/shops 缓存
  - 复用现有 `mapFlowerRow/mapShopRow/prepareShopTrustInfo`，前端零改动。
- 订单/支付（h5_shop 写路径）不受影响。
- 前端无需改动（同一 `/api/*` 契约，且已有失败回退 mock）。

### 附带收益
- 读接口不再依赖同事开放 MySQL 3306（原「待办：白名单」取消）。
- 商品/门店数据与小程序同源同口径（含上下架/营业状态/配送字段），业务一致性最好。
- `subMchId` / `profitSharingRatio` 随店返回 → 微信支付分账映射的权威数据源。
