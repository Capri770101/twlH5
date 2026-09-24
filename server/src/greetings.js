import express from 'express'
import { hq } from './h5db.js'
import { resolveUser } from './token.js'

const router = express.Router()
const RETENTION_DAYS = 90

function clean(v, max = 2000) {
  return String(v == null ? '' : v).trim().slice(0, max)
}

async function currentUserId(req) {
  const user = await resolveUser(req)
  return user && (user.phone || user.openid || user.username) ? Number(user.id) : null
}

function front(row) {
  return {
    id: String(row.id),
    text: row.text || '',
    imageUrl: row.image_url || '',
    template: row.template || 'warm',
    recipient: row.recipient || '',
    sender: row.sender || '',
    occasion: row.occasion || '',
    createdAt: row.created_at || '',
    expiresAt: row.expires_at || ''
  }
}

async function purgeExpired(userId) {
  await hq('DELETE FROM user_greetings WHERE expires_at < NOW() AND user_id = ?', [userId])
}

router.get('/', async (req, res) => {
  try {
    const userId = await currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'unauthorized' })
    await purgeExpired(userId)
    const rows = await hq(
      'SELECT id, text, image_url, template, recipient, sender, occasion, created_at, expires_at FROM user_greetings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId]
    )
    res.json({ list: rows.map(front) })
  } catch (e) {
    console.error('[greetings] list failed:', e.message)
    res.status(500).json({ error: '贺卡读取失败' })
  }
})

router.post('/', async (req, res) => {
  try {
    const userId = await currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'unauthorized' })
    const b = req.body && typeof req.body === 'object' ? req.body : {}
    const text = clean(b.text, 600)
    if (!text) return res.status(400).json({ error: '缺少贺卡正文' })
    const id = 'GRT_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    await hq(
      'INSERT INTO user_greetings (id, user_id, text, image_url, template, recipient, sender, occasion, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
      [id, userId, text, clean(b.imageUrl || b.image_url, 1000), clean(b.template, 32) || 'warm', clean(b.recipient, 40), clean(b.sender, 40), clean(b.occasion, 40), RETENTION_DAYS]
    )
    const rows = await hq('SELECT id, text, image_url, template, recipient, sender, occasion, created_at, expires_at FROM user_greetings WHERE id = ?', [id])
    res.status(201).json(front(rows[0]))
  } catch (e) {
    console.error('[greetings] save failed:', e.message)
    res.status(500).json({ error: '贺卡保存失败' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const userId = await currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'unauthorized' })
    const result = await hq('DELETE FROM user_greetings WHERE id = ? AND user_id = ?', [clean(req.params.id, 80), userId])
    if (!result.affectedRows) return res.status(404).json({ error: '贺卡不存在' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[greetings] delete failed:', e.message)
    res.status(500).json({ error: '贺卡删除失败' })
  }
})

export default router
