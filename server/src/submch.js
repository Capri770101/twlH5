// 子商户号解析（shopId → sub_mchid / settleRatio）
// 单独成模块：pay.js（下单/退款）与 profitsharing.js（分账）都要用，
// 放在 pay.js 里会造成两者循环 import。
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let _cache = null
function loadConfig() {
  if (_cache) return _cache
  // 以「src/..」即 server 目录为基准（本地 server/ 与线上 /opt/twlh5-api 两种布局均成立）
  const p = path.join(__dirname, '..', 'config', 'submch.json')
  try {
    _cache = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    _cache = {}
  }
  return _cache
}

/**
 * 解析店铺对应的子商户与分账比例。
 * 优先级：① server/config/submch.json ② shops 表 sub_mchid 列
 * @returns {Promise<{subMchid:string, subAppid:string, settleRatio:number}>}
 */
export async function resolveSubMch(shopId) {
  const cfg = loadConfig()
  if (cfg[shopId]) {
    const m = cfg[shopId]
    // subAppid 刻意不回落成服务商 appid：把 sp_appid 又当 sub_appid 传会被微信判非法请求
    return { subMchid: m.subMchid, subAppid: m.subAppid || '', settleRatio: m.settleRatio || 0 }
  }
  try {
    const rows = await query('SELECT sub_mchid, sub_appid, settle_ratio FROM `shops` WHERE id = ?', [shopId])
    if (rows[0] && rows[0].sub_mchid) {
      return {
        subMchid: rows[0].sub_mchid,
        subAppid: rows[0].sub_appid || '',
        settleRatio: Number(rows[0].settle_ratio) || 0
      }
    }
  } catch (e) { /* DB 不可达则忽略，下面报错 */ }
  throw new Error('未找到 shopId=' + shopId + ' 的子商户号 sub_mchid（请配置 server/config/submch.json 或 shops.sub_mchid）')
}
