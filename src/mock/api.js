import mockData from './data'

// 模拟网络延迟
const delay = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms))

// ===== 首页 =====
export async function getHomeIndex() {
  const data = { ...mockData.homeData }
  data.recommendFlowers = mockData.enrichFlowerList(mockData.flowers.slice(0, 6))
  data.nearbyShops = mockData.shops.slice(0, 4).map(shop => ({
    ...shop,
    distanceKm: parseFloat(shop.distance) || null
  }))
  await delay()
  return data
}

// ===== 花束详情 =====
export async function getFlowerDetail(id) {
  const flower = mockData.flowers.find(f => f.id === id)
  await delay()
  if (!flower) return null
  const enriched = mockData.enrichFlowerItem(flower)

  // 详情页特有衍生字段（对应 detail.js 中的处理）
  const price = flower.price || 0
  const originalPrice = flower.originalPrice || 0
  const hasDiscount = originalPrice > price
  const discountRate = hasDiscount
    ? (Math.round((price / originalPrice) * 100) / 10).toFixed(1)
    : '0'

  return {
    ...enriched,
    hasDiscount,
    discountRate,
    displayTags: flower.tags || [],
    materialItems: flower.flowers || [],
    sceneItems: flower.tags || [],
    meaningText: flower.flowerMeaning || '',
    descriptionText: flower.description || '',
    serviceItems: ['坏单包退', '缺枝补发', '准时送达', '花材新鲜'],
    deliveryText: '同城配送'
  }
}

// ===== 分类 =====
export async function getCategories() {
  await delay(80)
  return mockData.categories
}

// ===== 花束列表（分类/排序/分页复用） =====
export async function getFlowerList({ categoryId = '', sort = 'default', page = 1, pageSize = 10 } = {}) {
  let list = [...mockData.flowers]
  if (categoryId) list = list.filter(f => f.categoryId === categoryId)
  if (sort === 'sales') list.sort((a, b) => b.sales - a.sales)
  if (sort === 'price_asc') list.sort((a, b) => a.price - b.price)
  if (sort === 'price_desc') list.sort((a, b) => b.price - a.price)
  const start = (page - 1) * pageSize
  await delay()
  return {
    list: mockData.enrichFlowerList(list.slice(start, start + pageSize)),
    total: list.length,
    hasMore: start + pageSize < list.length
  }
}

// ===== 订单 =====
function decorateOrder(o) {
  return {
    ...o,
    _hasReview: !!o.review,
    _canDelete: ['completed', 'refunded', 'refund_failed', 'cancelled'].includes(o.status),
    _canRefund: ['pending', 'making', 'delivering'].includes(o.status),
    _totalQty: (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0)
  }
}

export async function getOrderList(status = 'all') {
  let list = mockData.orders.map(decorateOrder)
  if (status === 'refund') {
    list = list.filter(o => ['refunding', 'refunded', 'refund_failed'].includes(o.status))
  } else if (status === 'review') {
    list = list.filter(o => o.status === 'completed' && !o._hasReview)
  } else if (status && status !== 'all') {
    list = list.filter(o => o.status === status)
  }
  await delay()
  return list
}

export async function getOrderDetail(id) {
  const order = mockData.orders.find(o => o.id === id)
  await delay()
  return order ? decorateOrder(order) : null
}

/** 提交订单：写入内存 mock 列表，返回新订单号 */
export async function createOrder(payload) {
  await delay(400)
  const id = '20260' + String(Date.now()).slice(-6)
  const order = {
    id,
    status: 'pending',
    statusText: '待接单',
    items: payload.items.map(i => ({
      id: i.id,
      name: i.name,
      subtitle: i.subtitle,
      image: i.image,
      price: i.price,
      quantity: i.quantity
    })),
    totalPrice: payload.totalPrice,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    address: payload.address,
    expectDeliveryTime: payload.expectDeliveryTime,
    pickupMethod: payload.pickupMethod,
    cardContent: payload.cardContent,
    remark: payload.remark
  }
  mockData.orders.unshift(order)
  return { id, status: 'pending' }
}

// ===== 配送/取货时间可选日期 =====
export function getDeliveryDates() {
  const slots = ['尽快送达（约1小时）', '上午 9:00-12:00', '下午 14:00-18:00', '晚上 18:00-21:00']
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const today = new Date()
  return [0, 1, 2].map(offset => {
    const d = new Date(today.getTime() + offset * 86400000)
    const label = offset === 0 ? '今天' : offset === 1 ? '明天' : '后天'
    const dateLabel = `${label} ${d.getMonth() + 1}/${d.getDate()} ${week[d.getDay()]}`
    const daySlots = (offset === 0 ? slots : slots.slice(1)).map(timeSlot => ({
      timeSlot,
      fullText: `${dateLabel} ${timeSlot}`
    }))
    return { dateLabel, slots: daySlots }
  })
}
// ===== 店铺详情 =====
function prepareShopTrustInfo(shop) {
  const next = { ...shop }
  const name = String(shop.name || '')
  const rating = Number(shop.rating || 0)
  const ratingCount = Number(shop.ratingCount || 0)
  next.hasReviews = ratingCount > 0 && rating > 0
  next.displayRating = next.hasReviews ? rating.toFixed(1) + ' ›' : '暂无'
  next.reviewTabText = ratingCount > 0 ? `评价 ${ratingCount}` : '评价'
  const sales = Number(shop.monthSales || 0)
  next.displaySales = sales > 0 ? `月售${sales}` : (shop.flowers ? `在售${shop.flowers.length}款` : '近期上新')
  // 商家特色标签（与小程序 prepareShopTrustInfo 同款启发式）
  const isQianbaidu = name.indexOf('千百度') >= 0
  const isXingfu = name.indexOf('幸福') >= 0
  const isHuameijia = name.indexOf('花美家') >= 0
  next.featureLabel = isQianbaidu ? '经营年限' : '商家特色'
  next.featureValue = isQianbaidu ? '18年老店' : '极速开票'
  const setDefault = (k, v) => { if (!String(next[k] || '').trim()) next[k] = v }
  if (isQianbaidu) {
    setDefault('brandSlogan', '千百度花坊 · 20年匠心花艺 · 用一束花表达心意')
    setDefault('ipTitle', '主理人任大姐')
    setDefault('ipText', '20年严选好花材，热情豪爽，把每一束花都包扎得体面又有心意。')
    setDefault('serviceNote', '尊贵的客人，如有订花、配送、自取或定制需求，任大姐竭诚为您服务。')
  } else if (isXingfu) {
    setDefault('brandSlogan', '幸福花店 · 始于2013年 · 用鲜花记录每一份幸福')
    setDefault('ipTitle', '主理人江燕')
    setDefault('ipText', '2013年开始深耕花艺，审美在线，包出来的花大气又洋气，认真挑花、细心搭配，把每一份祝福都做得有质感。')
    setDefault('serviceNote', '亲爱的客人，如需订花、配送、自取或定制花礼，江燕会用心为您安排。')
  } else if (isHuameijia) {
    setDefault('brandSlogan', '花美家AI花店 · 懂场景也懂心意的鲜花服务')
    setDefault('ipTitle', '花美家花艺顾问')
    setDefault('ipText', '根据场景和预算推荐合适花礼，注重配色、包装和送达体验，让表达更省心。')
    setDefault('serviceNote', '尊敬的客人，如有订花、搭配、配送或定制需求，花美家花艺顾问随时为您服务。')
  } else {
    setDefault('brandSlogan', `${name || '花店'} · 精选花材 · 用心服务每一份托付`)
    setDefault('ipTitle', '花店主理人')
    setDefault('ipText', '严选新鲜花材，认真搭配包装，把每一份心意稳妥送到。')
    setDefault('serviceNote', '尊敬的客人，如有订花、配送、自取或定制需求，我们竭诚为您服务。')
  }
  return next
}

export async function getShopDetail(id) {
  const shopRaw = mockData.shops.find(s => s.id === id)
  await delay()
  if (!shopRaw) return null
  const shop = prepareShopTrustInfo(shopRaw)
  const allFlowers = (shopRaw.flowers || [])
    .map(fid => mockData.flowers.find(f => f.id === fid))
    .filter(Boolean)
  const flowers = mockData.enrichFlowerList(allFlowers)
  const featured = flowers.slice(0, 3)
  // 商品分类（用于筛选 chips）
  const catMap = new Map()
  flowers.forEach(f => {
    const cid = f.categoryId || 'other'
    if (!catMap.has(cid)) {
      const cat = mockData.categories.find(c => c.id === cid)
      catMap.set(cid, { id: cid, name: cat ? cat.name : '其他' })
    }
  })
  const categories = [{ id: '', name: '全部' }, ...Array.from(catMap.values())]
  return { shop, flowers, featured, categories }
}

const SAMPLE_REVIEWS = [
  { user: '微信用户****8821', rating: 5, content: '花很新鲜，包装精致，配送准时，朋友收到很开心！', date: '2026-08-30', tags: ['包装精美', '配送快'] },
  { user: '微信用户****3360', rating: 5, content: '花艺师审美在线，配色高级，下次还来。', date: '2026-08-22', tags: ['花材新鲜'] },
  { user: '微信用户****1190', rating: 4, content: '整体满意，希望可以多几个包装颜色选择。', date: '2026-08-15', tags: ['服务好'] }
]

export async function getShopReviews(shopId) {
  await delay(120)
  return SAMPLE_REVIEWS
}

export async function searchAll(keyword) {
  const kw = (keyword || '').trim().toLowerCase()
  if (!kw) return { flowers: [], shops: [] }
  const flowers = mockData.flowers.filter(f =>
    (f.name || '').toLowerCase().includes(kw) ||
    (f.subtitle || '').toLowerCase().includes(kw) ||
    (f.tags || []).some(t => t.toLowerCase().includes(kw))
  )
  const shops = mockData.shops.filter(s =>
    (s.name || '').toLowerCase().includes(kw) ||
    (s.address || '').toLowerCase().includes(kw)
  )
  await delay()
  return { flowers: mockData.enrichFlowerList(flowers), shops }
}
