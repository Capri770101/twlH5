-- ============================================================
-- users 表升级：新增「账号 / 密码」登录字段（H5 账号体系）
-- 新增：username（账号，唯一）、password_hash（scrypt 哈希）
-- 说明：h5_app 账号无 DDL 权限，本脚本需用 root 执行（仅执行一次，可重复执行）
-- 执行：mysql -uroot -p < server/sql/2026-09-15_users_auth.sql
-- ============================================================
USE h5_shop;

DROP PROCEDURE IF EXISTS add_users_auth_columns;
DELIMITER $$
CREATE PROCEDURE add_users_auth_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = 'h5_shop' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username') THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(32) NULL COMMENT '账号（字母开头，4-20 位字母/数字/下划线）' AFTER unionid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = 'h5_shop' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash') THEN
    ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL COMMENT '密码哈希（scrypt，零依赖）' AFTER username;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = 'h5_shop' AND TABLE_NAME = 'users' AND INDEX_NAME = 'uk_username') THEN
    ALTER TABLE users ADD UNIQUE KEY uk_username (username);
  END IF;
END$$
DELIMITER ;

CALL add_users_auth_columns();
DROP PROCEDURE add_users_auth_columns;
