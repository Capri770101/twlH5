# flower_shop 数据源结构（s001 平台）

> 来源：用户从 s001 平台数据源导出；MySQL **8.0.46**；库名 `flower_shop`；共 3 张表。
> 用途：H5 官网按「方案 B 混合」只读接入——商品/店铺主数据复用此库（只读账号），用户/订单/支付等 H5 自有数据建独立库。

---

## 一、products（商品表，22 字段）

| 分类 | 字段 | 类型 | 说明 |
|---|---|---|---|
| 主键/关联 | id | varchar, NOT NULL | 商品主键 |
| | owner_shop_id | — | 归属店铺 |
| | source_product_id | — | 来源商品 |
| | category_id | — | 分类 |
| 内容 | name | NOT NULL | 商品名 |
| | subtitle | — | 副标题 |
| | description | longtext | 描述（可能存 base64 大图） |
| | flower_meaning | — | 花语 |
| | season | — | 季节 |
| | shelf_life | — | 保鲜期 |
| 价格库存 | price | int | ⚠️ 疑似「分」单位 |
| | original_price | int | ⚠️ 疑似「分」单位 |
| | stock | — | 库存 |
| | sales | — | 销量 |
| | rating | decimal | 评分 |
| 富媒体/结构化 | image | longtext | ⚠️ 可能 base64 |
| | images | json | 图集 |
| | tags | json | 标签 |
| | flowers | json | 花材 |
| | raw | json | 原始数据 |
| 时间 | created_at | — | 默认 CURRENT_TIMESTAMP |
| | updated_at | — | 默认 CURRENT_TIMESTAMP |

## 二、shops（店铺表，19 字段）

| 分类 | 字段 | 类型 | 说明 |
|---|---|---|---|
| 基础 | id | NOT NULL | 店铺主键（varchar） |
| | name | NOT NULL | 店铺名 |
| | phone | — | 电话 |
| | address | — | 地址 |
| 图片（均为 longtext，⚠️ 可能 base64） | avatar | longtext | 头像 |
| | cover | longtext | 封面 |
| | qrcode_url | longtext | 二维码 |
| | wechat_qr_code | longtext | 微信二维码 |
| 营业配送 | business_hours | — | 营业时间 |
| | delivery_time | — | 配送时长 |
| | delivery_fee | int | ⚠️ 疑似「分」单位 |
| | min_order_price | int | ⚠️ 疑似「分」单位 |
| | month_sales | — | 月销 |
| | rating | — | 评分 |
| | status | — | 默认 active |
| 结构化 | tags | json | 标签 |
| | raw | json | 原始数据 |
| 时间 | created_at / updated_at | — | 默认 CURRENT_TIMESTAMP |

## 三、shop_products（店铺-商品关联表，4 字段）

| 字段 | 类型 | 说明 |
|---|---|---|
| shop_id + product_id | 联合 NOT NULL | 关联主键 |
| sort_order | — | 排序 |
| created_at | — | 默认 CURRENT_TIMESTAMP |

---

## 四、迁移/接入注意点（来自导出方）

1. **无外键**：三表仅靠逻辑关联（shop_products ↔ products/shops），迁移后建议补 FK 或在应用层保证一致性。H5 只读场景在应用层 join 即可。
2. **价格量纲**：`price / original_price / delivery_fee / min_order_price` 均为 int，**大概率是「分」为单位**。迁移/展示时务必确认量纲，别弄错 100 倍。
3. **json 字段**：`images / tags / flowers / raw`（products）、`tags / raw`（shops）为 json 类型。若目标库非 MySQL 8+（PG / 老版本）需转 jsonb / text。H5 后端读取后需 JSON.parse 再下发。
4. **longtext 大图**：`image / avatar / cover / description` 用 longtext，**可能存 base64 大图**，迁移包体积偏大；建议改存对象存储只留 URL。H5 若直读库取 longtext 渲染会慢，需确认实际存储形式。
5. **主键 collation**：主键是 varchar，请确认排序规则一致，避免大小写/中文排序差异导致重复键。

---

## 五、对 H5 接入（方案 B）的影响

- H5 商品页 / 店铺页数据源即这三表，字段可直接映射；`owner_shop_id` 关联店铺，`shop_products` 做店铺↔商品中间表。
- **价格量纲必须先确认**（注意点 2）：H5 当前代码/配置按「元」对接（`DB_PRICE_UNIT=yuan`），若实际是「分」则订单金额会差 100 倍——落地前必须在源库查一行真实数据核实。
- **图片存储形式必须确认**（注意点 4）：若为 base64，H5 不应直读 longtext，应走对象存储 URL。
- json 字段后端读取后 parse，前端按需渲染。
- 三表无 FK，H5 只读不做写入，影响小；但展示店铺商品需用 `shop_products` 在应用层 join。
