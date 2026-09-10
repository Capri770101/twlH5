// MySQL 连接池（仅服务端使用，账号密码来自 .env，绝不暴露给前端）
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

// SSL：用户要求 Required。未提供 CA，故 rejectUnauthorized:false 仅做加密不做证书校验。
// 若后续平台提供 CA，可改为 { ca: fs.readFileSync('ca.pem') } 并 rejectUnauthorized:true。
const sslMode = process.env.DB_SSL === 'false' ? false : true

const pool = mysql.createPool({
  host: process.env.DB_HOST || '118.25.21.45',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'ai_readonly',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flower_shop',
  connectionLimit: 5,
  waitForConnections: true,
  charset: 'utf8mb4',
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 4000),
  ssl: sslMode ? { rejectUnauthorized: false } : undefined
})

/** 执行查询，返回行数组 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/** 读取某表列名（用于发现真实 schema） */
export async function getColumns(table) {
  const rows = await query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [process.env.DB_NAME || 'flower_shop', table]
  )
  return rows.map(r => r.COLUMN_NAME)
}

export default pool
