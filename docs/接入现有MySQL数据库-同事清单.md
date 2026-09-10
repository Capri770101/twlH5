# H5 接入现有 MySQL 数据库 — 需同事提供/操作的清单

## 背景
H5 官网（服务器 `8.138.248.173`）要**只读**复用小程序那套 `flower_shop` 库（`products` / `shops` / `shop_products` 三表）做商品/店铺展示。H5 **只 SELECT、不写库**，不会增加轻量服务器的磁盘负担，也不会动小程序的数据。

---

## 同事需提供 / 操作（照做版）

### 1. 只读数据库账号 + 密码
- 用已有的 `ai_readonly` 账号，**给我真实密码**；或新建一个更清晰的 `h5_readonly`：
  ```sql
  CREATE USER 'h5_readonly'@'%' IDENTIFIED BY '强密码';
  GRANT SELECT ON flower_shop.* TO 'h5_readonly'@'%';
  FLUSH PRIVILEGES;
  ```
- ⚠️ 密码只通过私信/密钥管理给到我，**绝不进 Git、绝不发群、绝不截图外传**。

### 2. 白名单放行 H5 服务器 IP（最关键）
- 把 **`8.138.248.173`** 加进 MySQL「允许来源 / 访问白名单」。
- （可选）若我也要本地连库联调，再补一个**本机出口 IP**（可后补，不阻塞）。

### 3. 确认 3306 网络可达
- 确认 DB 主机地址与端口：**我目前记录是 `118.25.21.45:3306`，请同事核对是「公网地址」还是「仅内网」**。
- 若仅内网：确认 248.173 与轻量服务器是否同 VPC/同地域可内网互通；否则需**云安全组放行来自 248.173 的 TCP 3306 入站**（走公网）。
- 验证（同事或我侧均可）：
  ```bash
  telnet 118.25.21.45 3306
  # 或
  mysql -h 118.25.21.45 -P 3306 -u h5_readonly -p
  ```

### 4. 连接参数核对（已知项，确认即可）
| 项 | 值 | 状态 |
|----|----|------|
| host | 118.25.21.45（请确认公网/内网） | 待核对 |
| port | 3306 | 默认 |
| database | flower_shop | ✅ 已知 |
| 字符集 / collation | utf8mb4（具体排序规则待确认） | 待确认（避免 varchar 主键排序差异导致重复键） |

### 5. 两个数据确认项（影响代码，请抽查一条）
- **价格单位**：已确认 int 列（`price/original_price/delivery_fee/min_order_price`）为「分」。✅ 代码已设 `DB_PRICE_UNIT=cents`，展示时自动 ÷100。
- **图片字段格式**：`image / avatar / cover / description` 是 `https://...` URL 还是 `data:image/...;base64,...` 大段？请跑：
  ```sql
  SELECT p.id, p.name, p.image, s.avatar
  FROM products p JOIN shops s ON p.owner_shop_id = s.id
  LIMIT 1;
  ```
  - 若是 URL → 直接可用；
  - 若是 base64 → 需先改存对象存储只留 URL，否则前端拉取极慢、还可能撑爆传输。

### 6. SSL 连接（可选但推荐）
- 若 DB 要求 SSL 连接，请同事提供 CA 证书（或确认可关闭 SSL 用明文）。H5 后端 `db.js` 已预留 SSL 开关。

---

## 同事侧的两条路线（请你二选一）

- **路线 A（推荐，最快）**：同事只做上面 1–3，给只读密码 + 放行 `8.138.248.173`，H5 后端**直连** MySQL，零平台代码改动。
- **路线 B（不改白名单）**：同事在**已白名单的 agent 平台（`8.138.203.6`）加一组只读 `/api` JSON 端点**（复用现有查库连接），H5 调这些端点而非直连 MySQL。代价是同事要改平台代码，但完全不动 DB 白名单策略。

---

## 我拿到物料后的动作（不依赖同事）
1. 填 `server/.env`：`DB_HOST / DB_PORT / DB_USER=h5_readonly / DB_PASSWORD=密码 / DB_NAME=flower_shop / DB_PRICE_UNIT=cents`
2. 把 `server/` 后端部署到 `248.173:4000`（nginx 的 `/api/` 反代已预留）
3. 打 `/api/health` 看 `dbConnected:true` 即通 → 首页/列表/店铺页出真实数据

> 注意：`flower_shop` 是只读库且只有 3 张表，**没有 users / orders**。所以商品展示能接真数据，但登录、下单这类「写」操作仍走 mock / 本地存储，直到 H5 自建订单库（方案 B 的另一半）落地。
