USE h5_shop;

CREATE TABLE IF NOT EXISTS user_greetings (
  id          VARCHAR(48) NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  text        VARCHAR(600) NOT NULL,
  image_url   VARCHAR(1000) NULL,
  template    VARCHAR(32) NOT NULL DEFAULT 'warm',
  recipient   VARCHAR(40) NULL,
  sender      VARCHAR(40) NULL,
  occasion    VARCHAR(40) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_greeting_user_created (user_id, created_at),
  KEY idx_greeting_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户 AI 贺卡，默认保留 90 天';

SET @has_card_data := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'card_data'
);
SET @card_sql := IF(
  @has_card_data = 0,
  'ALTER TABLE orders ADD COLUMN card_data JSON NULL COMMENT ''结构化贺卡快照''',
  'SELECT 1'
);
PREPARE card_stmt FROM @card_sql;
EXECUTE card_stmt;
DEALLOCATE PREPARE card_stmt;

CREATE TABLE IF NOT EXISTS user_diy_plans (
  plan_id     VARCHAR(80) NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  plan_data   JSON NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, user_id),
  KEY idx_diy_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录用户保存的 AI DIY 方案';
