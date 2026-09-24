import express from 'express'
import { hq } from './h5db.js'
import { resolveUser } from './token.js'

const router = express.Router()

function text(v, max = 4000) { return String(v == null ? '' : v).trim().slice(0, max) }

async function userId(req) {
  const u = await resolveUser(req)
  return u && (u.phone || u.openid || u.username) ? Number(u.id) : null
}

function front(row) {
  let data = {}
  try { data = typeof row.plan_data === 'object' ? row.plan_data : JSON.parse(row.plan_data || '{}') } catch (e) {}
  return { ...data, id: row.plan_id, savedAt: row.created_at, updatedAt: row.updated_at }
}

router.get('/', async (req, res) => {
  try {
    const uid = await userId(req)
    if (!uid) return res.status(401).json({ error: 'unauthorized' })
    const rows = await hq('SELECT plan_id, plan_data, created_at, updated_at FROM user_diy_plans WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', [uid])
    res.json({ list: rows.map(front) })
  } catch (e) {
    console.error('[diy-plans] list failed:', e.message)
    res.status(500).json({ error: '方案读取失败' })
  }
})

router.post('/', async (req, res) => {
  try {
    const uid = await userId(req)
    if (!uid) return res.status(401).json({ error: 'unauthorized' })
    const p = req.body && typeof req.body === 'object' ? req.body : {}
    const id = text(p.id || p.plan_id, 80)
    if (!id) return res.status(400).json({ error: '缺少方案 id' })
    const data = { ...p, id }
    await hq(
      'INSERT INTO user_diy_plans (plan_id, user_id, plan_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE plan_data = VALUES(plan_data), updated_at = CURRENT_TIMESTAMP',
      [id, uid, JSON.stringify(data)]
    )
    const rows = await hq('SELECT plan_id, plan_data, created_at, updated_at FROM user_diy_plans WHERE plan_id = ? AND user_id = ?', [id, uid])
    res.status(201).json(front(rows[0]))
  } catch (e) {
    console.error('[diy-plans] save failed:', e.message)
    res.status(500).json({ error: '方案保存失败' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const uid = await userId(req)
    if (!uid) return res.status(401).json({ error: 'unauthorized' })
    const r = await hq('DELETE FROM user_diy_plans WHERE plan_id = ? AND user_id = ?', [text(req.params.id, 80), uid])
    if (!r.affectedRows) return res.status(404).json({ error: '方案不存在' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[diy-plans] delete failed:', e.message)
    res.status(500).json({ error: '方案删除失败' })
  }
})

export default router
