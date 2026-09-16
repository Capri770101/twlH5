-- H5 分账（profit sharing）字段 —— 2026-09-16
--
-- 执行方式（业务账号 h5_app 无 DDL 权限，必须用 root）：
--   mysql --defaults-file=/root/.twlh5-client.cnf h5_shop < server/sql/2026-09-16_profitsharing.sql
--
-- 幂等说明：重复执行会报 1060（Duplicate column name）/ 1061（Duplicate key name），
-- 属预期（表结构已就位），可忽略。
--
-- 字段含义：
--   ps_state          分账状态：none 无需分账 / pending 待分账（已到期会由扫描任务执行）
--                     / success 已分账 / processing 微信处理中 / failed 失败（ps_message 有原因）
--   ps_ratio          下单时冻结的分账比例（%）
--   ps_amount         分账金额（分）= floor(订单金额 × 比例%)，最低 1 分
--   ps_order_id       微信分账单号（回退时作为 order_id 传入）
--   ps_return_*       分账回退（退款前必须先回退，否则资金对不上）

ALTER TABLE orders
  ADD COLUMN ps_state             VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '分账状态 none/pending/success/processing/failed',
  ADD COLUMN ps_ratio             INT          NOT NULL DEFAULT 0      COMMENT '分账比例(%)',
  ADD COLUMN ps_amount            INT          NOT NULL DEFAULT 0      COMMENT '分账金额(分)',
  ADD COLUMN ps_order_id          VARCHAR(64)  NULL                     COMMENT '微信分账单号',
  ADD COLUMN ps_message           VARCHAR(255) NULL                     COMMENT '分账失败原因/微信返回',
  ADD COLUMN ps_updated_at        DATETIME     NULL,
  ADD COLUMN ps_return_state      VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '分账回退状态 none/processing/success/failed',
  ADD COLUMN ps_return_amount     INT          NOT NULL DEFAULT 0       COMMENT '已回退金额(分)',
  ADD COLUMN ps_return_message    VARCHAR(255) NULL,
  ADD COLUMN ps_return_updated_at DATETIME     NULL;

ALTER TABLE orders ADD INDEX idx_ps_scan (ps_state, pay_time);
