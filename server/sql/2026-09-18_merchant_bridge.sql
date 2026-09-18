-- ============================================================================
-- 商家后端订单桥接 —— h5_shop.orders 新增字段
-- 2026-09-18
-- 执行账号：root@3307（h5_app 只有 DML，无法 ALTER）
-- 幂等：重复执行会报 Duplicate column，可忽略
--
-- 用途：把 H5 已收款订单投递给同机的商家后端（flower-shop），
--       从而获得商家的企业微信群通知与门店派单；此处记录投递与回捞结果。
-- 详见 docs/商家订单桥接-实现说明.md
-- ============================================================================

ALTER TABLE h5_shop.orders
  ADD COLUMN merchant_order_id        VARCHAR(64)  NULL           COMMENT '商家侧订单号（= H5 订单号）',
  ADD COLUMN merchant_sync_state      VARCHAR(24)  NULL           COMMENT 'null未投递|success|rejected商家拒|paid_failed|amount_mismatch|failed',
  ADD COLUMN merchant_sync_error      VARCHAR(255) NULL           COMMENT '最近一次失败原因（人可读）',
  ADD COLUMN merchant_sync_attempts   INT          NOT NULL DEFAULT 0 COMMENT '投递尝试次数（补偿扫描用）',
  ADD COLUMN merchant_sync_at         DATETIME     NULL           COMMENT '最近一次投递时间',
  ADD COLUMN merchant_amount          INT          NOT NULL DEFAULT 0 COMMENT '商家侧算出金额（分），用于对账',
  ADD COLUMN merchant_status          VARCHAR(24)  NULL           COMMENT '商家侧履约状态 new/pending/paid/making/delivering/completed',
  ADD COLUMN merchant_status_at       DATETIME     NULL           COMMENT '商家状态最近同步时间',
  ADD COLUMN merchant_refund_audit    VARCHAR(16)  NULL           COMMENT '商家退款审核结果 approved|rejected',
  ADD COLUMN merchant_refund_audit_at DATETIME     NULL           COMMENT '商家退款审核时间';

ALTER TABLE h5_shop.orders
  ADD INDEX idx_orders_merchant_sync (merchant_sync_state);
