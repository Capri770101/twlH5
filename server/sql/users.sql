-- ============================================================
-- 跳舞兰AI花店 · 用户表模板 (users)
-- ============================================================
-- 用途：存储注册用户（手机号验证码 / 微信授权登录）的基础资料。
--
-- 重要说明：
--   当前不确定生产库 flower_shop 是否已存在 users 表，本文件是「建表模板」。
--   在白名单机器部署后端后，可先访问 GET /api/meta/tables 查看现有表清单：
--     - 若已有 users（或同名表），只需在 .env 里用 TBL_USERS 指向真实表名即可；
--     - 若不存在，再执行本文件建表（CREATE TABLE IF NOT EXISTS 已做幂等保护）。
--
-- 价格单位：与 flower_shop 库其它表保持一致（见后端 .env 的 DB_PRICE_UNIT）。
-- 字符集：utf8mb4（兼容 emoji 昵称 / 头像 URL）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `openid`          VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '微信 openid（微信授权登录时写入）',
  `unionid`         VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '微信 unionid（多应用打通用）',
  `nickname`        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '昵称',
  `avatar`          VARCHAR(512) NOT NULL DEFAULT '' COMMENT '头像 URL（或 emoji 字符）',
  `phone`           VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '手机号（验证码登录时写入）',
  `gender`          TINYINT      NOT NULL DEFAULT '0' COMMENT '性别 0未知 1男 2女',
  `country`         VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '国家',
  `province`        VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '省份',
  `city`            VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '城市',
  `status`          TINYINT      NOT NULL DEFAULT '1' COMMENT '状态 1正常 0禁用',
  `register_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `last_login_time` DATETIME     DEFAULT NULL COMMENT '最近登录时间',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_status` (`status`),
  KEY `idx_register_time` (`register_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表（手机号/微信登录用户资料）';

-- ============================================================
-- 与后端 /api/users 的字段映射（见 server/src/mapping.js mapUserRow）
--   返回给前端的字段已脱敏：phone 显示为 138****8888，openid 显示为 ***。
--   密码 / 微信 access_token 等敏感字段一律不入库、不返回。
-- ============================================================

-- 可选：如需在页面展示「已有用户数」，可临时执行：
--   SELECT COUNT(*) FROM `users`;
