// h5_shop 自建业务库连接池（订单/用户/支付）——与 db.js（flower_shop 只读商品库）职责分离
// 部署：129.204.85.139（内网 172.16.16.7）本机 MySQL 8，当前端口 3307，仅监听 127.0.0.1，无需 SSL
// ⚠️ 旧注释写的 8.138.248.173 是已弃用的 H5 验收机（2026-09 迁至 129.204.85.139）
// 账号密码来自 .env 的 H5_DB_*（绝不暴露给前端）
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.H5_DB_HOST || '127.0.0.1',
  port: Number(process.env.H5_DB_PORT || 3306),
  user: process.env.H5_DB_USER || 'h5_app',
  password: process.env.H5_DB_PASSWORD || '',
  database: process.env.H5_DB_NAME || 'h5_shop',
  connectionLimit: 5,
  waitForConnections: true,
  charset: 'utf8mb4',
  // 直接返回 'YYYY-MM-DD HH:mm:ss' 字符串，避免 Date 对象时区/格式化差异
  dateStrings: true,
  connectTimeout: 10000
})

/**
 * 执行 SQL。
 * SELECT → 行数组；INSERT/UPDATE/DELETE → ResultSetHeader（调用处用 Array.isArray 区分）
 */
export async function hq(sql, params = []) {
  const [result] = await pool.query(sql, params)
  return result
}

/** 事务执行器：fn(conn) 内用 conn.query(...)；自动 commit/rollback */
export async function withTx(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const r = await fn(conn)
    await conn.commit()
    return r
  } catch (e) {
    try { await conn.rollback() } catch (e2) { /* ignore */ }
    throw e
  } finally {
    conn.release()
  }
}

/** 健康检查：能连则返回 true */
export async function h5DbHealth() {
  await pool.query('SELECT 1')
  return true
}

export default pool
