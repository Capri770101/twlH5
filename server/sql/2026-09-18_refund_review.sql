-- ============================================================================
-- 退款人工审核（走商家后台审核）—— h5_shop.orders 新增 refund_prev_status
-- 2026-09-18
-- 执行账号：root@3307
--
-- 用途：审核模式下的状态机为
--   申请 → refund_applying（资金未动）→ 商家审核
--        → 通过：H5 执行微信退款（唯一出账点）
--        → 拒绝：恢复到 refund_prev_status（即申请退款前的状态）
--   没有 refund_prev_status 就不知道该恢复到哪一步（paid / making / delivering）。
-- 详见 docs/商家订单桥接-实现说明.md §7
-- ============================================================================

ALTER TABLE h5_shop.orders
  ADD COLUMN refund_prev_status VARCHAR(20) NULL COMMENT '申请退款前的状态，被拒时恢复用';
