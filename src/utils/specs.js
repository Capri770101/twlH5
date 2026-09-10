/**
 * 商品规格（花束尺寸/支数档位）
 *
 * 数据来源优先级：
 *   1. 后端/商品自带的 flower.specs（若已配置，直接用）
 *   2. 由基础价派生三档标准规格（精致款 / 经典款 / 豪华款）
 *
 * 价格单位：分（与 store.money 一致）
 */

// 标准档位：支数 + 价格系数（相对基础价）
const SIZE_TIERS = [
  { key: 'S', label: '精致款', stems: 11, factor: 1, note: '日常心意' },
  { key: 'M', label: '经典款', stems: 19, factor: 1.4, note: '送人有面' },
  { key: 'L', label: '豪华款', stems: 33, factor: 2.1, note: '仪式感拉满' }
]

// 价格取整到「元」，避免出现 217.8 元这种零碎价
function roundYuan(fen) {
  return Math.max(100, Math.round(fen / 100) * 100)
}

function normalizeSpec(raw, idx) {
  if (!raw) return null
  const price = Number(raw.price ?? raw.priceFen ?? 0)
  const originalPrice = Number(raw.originalPrice ?? raw.originalPriceFen ?? 0)
  return {
    id: String(raw.id || raw.specId || 'spec' + idx),
    name: String(raw.name || raw.label || '规格' + (idx + 1)),
    desc: String(raw.desc || raw.note || ''),
    price: price > 0 ? price : 0,
    originalPrice: originalPrice > price ? originalPrice : 0,
    stock: raw.stock ?? null
  }
}

/**
 * 派生规格列表
 * @param {object} flower 商品对象（含 price / originalPrice / stock）
 * @returns {Array<{id,name,desc,price,originalPrice,stock}>}
 */
export function deriveSpecs(flower) {
  if (!flower) return []
  // 1. 商品自带规格
  if (Array.isArray(flower.specs) && flower.specs.length) {
    const list = flower.specs.map(normalizeSpec).filter(s => s && s.price > 0)
    if (list.length) return list
  }
  // 2. 由基础价派生
  const base = Number(flower.price || 0)
  if (base <= 0) return []
  const baseOriginal = Number(flower.originalPrice || 0)
  return SIZE_TIERS.map(t => ({
    id: 'size-' + t.key.toLowerCase(),
    name: `${t.stems}朵 · ${t.label}`,
    desc: t.note,
    price: roundYuan(base * t.factor),
    originalPrice: baseOriginal > base ? roundYuan(baseOriginal * t.factor) : 0,
    stock: flower.stock ?? null
  }))
}

/** 取默认规格（第一档） */
export function defaultSpec(specs) {
  return (specs && specs.length && specs[0]) || null
}
