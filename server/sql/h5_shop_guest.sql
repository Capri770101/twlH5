-- ============================================================
-- 迁移：h5_shop.users 增加 guest_id（匿名访客身份，订单归属过渡方案）
-- 适用：已按旧版 h5_shop.sql 建库的服务器（8.138.248.173 本机 MySQL）
-- 执行：mysql -uh5_app -p h5_shop < h5_shop_guest.sql   （或 root 执行）
-- 幂等性：重复执行会因 uk_guest 索引已存在而报错，可忽略（用 IF NOT EXISTS 需要 MySQL 8.0.29+，此处兼容处理见注释）
-- ============================================================

USE h5_shop;

-- MySQL 8.0.29+ 可直接用：
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_id VARCHAR(64) NULL AFTER openid,
--                   ADD UNIQUE KEY IF NOT EXISTS uk_guest (guest_id);

-- 兼容写法（先查 information_schema 判断列是否已存在）
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'h5_shop' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'guest_id'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE users ADD COLUMN guest_id VARCHAR(64) NULL AFTER openid, ADD UNIQUE KEY uk_guest (guest_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
