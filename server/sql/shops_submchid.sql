-- 跳舞兰 H5：shops 表补充「微信支付子商户」字段，用于复用服务商分账体系
-- 在白名单机器（能连 flower_shop 的库）执行；列已存在则忽略。
ALTER TABLE `shops`
  ADD COLUMN IF NOT EXISTS `sub_mchid`   VARCHAR(32)  DEFAULT '' COMMENT '微信支付子商户号(特约商户号)，分账收款方',
  ADD COLUMN IF NOT EXISTS `sub_appid`   VARCHAR(32)  DEFAULT '' COMMENT '子商户公众号 appid（无则复用服务商 sp_appid）',
  ADD COLUMN IF NOT EXISTS `settle_ratio` DECIMAL(5,2) DEFAULT 0  COMMENT '该店分账/抽成比例(%)，仅记录用';
