-- ============================================================
-- 迁移：h5_shop 新增短信验证码表 sms_codes（debug 万能码先行）
-- 适用：8.138.248.173 本机 MySQL 的 h5_shop 库
-- 说明：后端 server/src/auth.js 启动时会自动执行 CREATE TABLE IF NOT EXISTS，
--       本文件供手工迁移 / 留档用（幂等，可重复执行）。
-- 模式：DEBUG_SMS=1（或未配腾讯云短信密钥）时前端联调用万能码即可，无需真发短信。
-- ============================================================

USE h5_shop;

CREATE TABLE IF NOT EXISTS sms_codes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone       VARCHAR(20)     NOT NULL COMMENT '手机号',
  scene       VARCHAR(16)     NOT NULL DEFAULT 'login' COMMENT '场景：login 等',
  code        VARCHAR(8)      NOT NULL COMMENT '6 位验证码',
  expires_at  DATETIME        NOT NULL COMMENT '过期时间（5 分钟）',
  used        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '0 未用 1 已消费',
  fail_count  TINYINT         NOT NULL DEFAULT 0 COMMENT '错误次数（≥5 自动作废）',
  create_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lookup (phone, scene, used, expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '短信验证码';

-- 校验：POST /api/auth/sms/login { phone, code }
-- debug 模式（.env DEBUG_SMS=1）万能码：123456
