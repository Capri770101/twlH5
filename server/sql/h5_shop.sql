-- ============================================================
-- h5_shop —— 跳舞兰 H5 官网自建业务库（订单/用户/支付）
-- 部署位置：8.138.248.173 本机 MySQL 8（仅 127.0.0.1 监听）
-- 与 flower_shop（小程序主库, 只读商品/店铺）职责分离：
--   H5 下单时从 flower_shop 读商品 → 快照进本库 order_items
-- 金额约定：一律 INT 存「分」；前端显示时才 ÷100 转元
-- 字符集：utf8mb4 / utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS h5_shop
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE h5_shop;

-- ---------- 用户（微信 openid / 手机号 双轨 + 匿名访客 guest_id，均可空，登录后回填） ----------
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  openid      VARCHAR(64)     NULL COMMENT '公众号网页授权 openid',
  guest_id    VARCHAR(64)     NULL COMMENT '匿名访客 id（未接微信登录前的过渡身份，兼作 Bearer token）',
  unionid     VARCHAR(64)     NULL COMMENT '开放平台 unionid（可空）',
  phone       VARCHAR(20)     NULL COMMENT '手机号',
  nickname    VARCHAR(64)     NULL,
  avatar      VARCHAR(512)    NULL,
  gender      VARCHAR(8)      NULL COMMENT 'male/female/secret',
  create_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_openid (openid),
  UNIQUE KEY uk_guest (guest_id),
  UNIQUE KEY uk_phone (phone),
  KEY idx_unionid (unionid)
) ENGINE = InnoDB COMMENT 'H5 用户';

-- ---------- 收货地址簿（可选；下单主要用订单内快照） ----------
CREATE TABLE IF NOT EXISTS addresses (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(32)     NOT NULL,
  phone       VARCHAR(20)     NOT NULL,
  region      VARCHAR(128)    NULL COMMENT '省市区',
  detail      VARCHAR(255)    NOT NULL,
  is_default  TINYINT(1)      NOT NULL DEFAULT 0,
  create_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id)
) ENGINE = InnoDB COMMENT '收货地址';

-- ---------- 订单主表 ----------
-- status: pending(待支付/待接单) paid 已支付 → making 制作中 → delivering 配送中 → completed 已完成
--          cancelled 已取消 / refunding 退款中 / refunded 已退款 / refund_failed 退款失败
CREATE TABLE IF NOT EXISTS orders (
  id              VARCHAR(32)    NOT NULL COMMENT '业务单号, 后端生成',
  user_id         BIGINT UNSIGNED NULL COMMENT '下单用户(登录后), 游客可空',
  shop_id         VARCHAR(32)    NULL COMMENT '归属花店 id',
  shop_name       VARCHAR(64)    NULL COMMENT '店铺名快照',
  status          VARCHAR(20)    NOT NULL DEFAULT 'pending',
  item_total      INT            NOT NULL DEFAULT 0 COMMENT '商品小计(分)',
  delivery_fee    INT            NOT NULL DEFAULT 0 COMMENT '配送费(分)',
  total_price     INT            NOT NULL COMMENT '应付总额(分)=item_total+delivery_fee',
  addr_name       VARCHAR(32)    NULL,
  addr_phone      VARCHAR(20)    NULL,
  addr_region     VARCHAR(128)   NULL,
  addr_detail     VARCHAR(255)   NULL,
  expect_delivery VARCHAR(64)    NULL COMMENT '期望送达文本',
  pickup_method   VARCHAR(16)    NULL COMMENT 'delivery/self 等',
  card_content    TEXT           NULL COMMENT '贺卡留言',
  remark          VARCHAR(255)   NULL,
  sub_mchid       VARCHAR(32)    NULL COMMENT '微信支付子商户(归属店), 分账用',
  wx_transaction_id VARCHAR(64)  NULL COMMENT '微信支付单号, 回调后写',
  pay_time        DATETIME       NULL,
  create_time     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_status (user_id, status),
  KEY idx_status_time (status, create_time),
  KEY idx_shop (shop_id)
) ENGINE = InnoDB COMMENT 'H5 订单';

-- ---------- 订单明细（商品快照, 改价/下架不影响历史单） ----------
CREATE TABLE IF NOT EXISTS order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   VARCHAR(32)     NOT NULL,
  product_id VARCHAR(32)     NOT NULL COMMENT 'flower_shop.products.id',
  name       VARCHAR(128)    NOT NULL COMMENT '商品名快照',
  subtitle   VARCHAR(255)    NULL COMMENT '副标题快照',
  image      VARCHAR(512)    NULL COMMENT '主图快照',
  price      INT             NOT NULL COMMENT '成交单价(分)快照',
  quantity   INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_product (order_id, product_id),
  KEY idx_order (order_id)
) ENGINE = InnoDB COMMENT '订单明细快照';

-- ---------- 支付流水（对账/退款依据, 回调原文留痕） ----------
CREATE TABLE IF NOT EXISTS payments (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       VARCHAR(32)     NOT NULL,
  out_trade_no   VARCHAR(32)     NOT NULL COMMENT '商户单号(与 order_id 同源)',
  transaction_id VARCHAR(64)     NULL COMMENT '微信支付单号',
  channel        VARCHAR(8)      NULL COMMENT 'jsapi/h5',
  amount         INT             NOT NULL COMMENT '支付金额(分)',
  status         VARCHAR(16)     NOT NULL DEFAULT 'pending' COMMENT 'pending/success/failed/refunded',
  sub_mchid      VARCHAR(32)     NULL,
  raw_callback   MEDIUMTEXT      NULL COMMENT '回调原文(JSON)留痕',
  create_time    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order (order_id),
  KEY idx_tx (transaction_id)
) ENGINE = InnoDB COMMENT '支付流水';
