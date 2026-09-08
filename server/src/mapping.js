// 把 MySQL 行映射成前端页面期望的字段形状。
// 策略：对未知列名做容错——尝试多种候选 key，缺失则给默认/空。
// 真实表结构确认后，只需在此文件微调候选 key 即可，无需改路由。

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function toStr(v) {
  return v == null ? '' : String(v)
}

function parseJsonOrArray(v) {
  if (Array.isArray(v)) return v.map(toStr)
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const a = JSON.parse(s)
        return Array.isArray(a) ? a.map(toStr) : [s]
      } catch (e) {
        return [s]
      }
    }
    return s.split(/[,，]/).map(x => x.trim()).filter(Boolean)
  }
  return []
}

// 价格单位：yuan=库里存元（×100 转分，前端按分展示）；cents=库里已是分
function priceCents(v, unit) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  if (unit === 'cents') return Math.round(n)
  return Math.round(n * 100)
}

function priceUnit() {
  return (process.env.DB_PRICE_UNIT || 'yuan').toLowerCase()
}

/** 花束行 → 前端花束卡片/详情形状（对齐 mock enrichFlowerItem） */
export function mapFlowerRow(row, opts = {}) {
  const price = priceCents(pick(row, 'price', 'price_yuan'), priceUnit())
  const originalPrice = priceCents(pick(row, 'original_price', 'originalPrice', 'price_original'), priceUnit())
  const hasDiscount = originalPrice > price
  const images = parseJsonOrArray(pick(row, 'images', 'imgs'))
  const image = pick(row, 'image', 'img', 'cover', 'image_url') || (images[0] || '')
  const stock = Number(pick(row, 'stock', 'quantity')) || 0
  const sales = Number(pick(row, 'sales', 'sales_volume')) || 0
  const enriched = {
    id: toStr(pick(row, 'id', 'flower_id', 'product_id', 'goods_id')),
    name: toStr(pick(row, 'name', 'title', 'product_name')),
    subtitle: toStr(pick(row, 'subtitle', 'sub_title', 'slogan', 'brief')),
    categoryId: toStr(pick(row, 'category_id', 'categoryId', 'cat_id')),
    tags: parseJsonOrArray(pick(row, 'tags')),
    price,
    originalPrice,
    image,
    images,
    description: toStr(pick(row, 'description', 'desc', 'detail')),
    flowers: parseJsonOrArray(pick(row, 'flowers', 'materials', 'flower_list')),
    flowerMeaning: toStr(pick(row, 'flower_meaning', 'meaning', 'flowerMeaning')),
    season: toStr(pick(row, 'season')),
    shelfLife: toStr(pick(row, 'shelf_life', 'shelfLife')),
    stock,
    sales,
    rating: Number(pick(row, 'rating', 'score')) || 0,
    // 衍生字段（与 mock enrichFlowerItem 保持一致）
    _hasDiscount: hasDiscount,
    _discountRate: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0,
    _statusClass: stock > 0 ? 'on' : 'off',
    _statusText: stock > 0 ? '上架中' : '已下架',
    _canReduce: (Number(pick(row, 'quantity')) || 1) > 1,
    img: image,
    priceText: (price / 100).toFixed(2),
    originalText: (originalPrice / 100).toFixed(2),
    showOriginal: hasDiscount,
    salesText: sales,
    hasDiscount,
    discountRate: hasDiscount ? (Math.round((price / originalPrice) * 100) / 10).toFixed(1) : '0'
  }
  if (opts.index !== undefined && opts.index < 3) enriched.rankFlag = String(opts.index + 1)
  return enriched
}

/** 店铺行 → 基础店铺对象 */
export function mapShopRow(row) {
  return {
    id: toStr(pick(row, 'id', 'shop_id', 'store_id')),
    name: toStr(pick(row, 'name', 'shop_name', 'store_name')),
    avatar: pick(row, 'avatar', 'logo', 'cover') || '',
    cover: pick(row, 'cover', 'avatar') || '',
    categoryId: toStr(pick(row, 'category_id', 'categoryId')),
    rating: Number(pick(row, 'rating')) || 0,
    ratingCount: Number(pick(row, 'rating_count', 'ratingCount')) || 0,
    monthSales: Number(pick(row, 'month_sales', 'monthSales')) || 0,
    deliveryTime: toStr(pick(row, 'delivery_time', 'deliveryTime')),
    deliveryFee: priceCents(pick(row, 'delivery_fee', 'deliveryFee'), priceUnit()),
    minOrderPrice: priceCents(pick(row, 'min_order_price', 'minOrderPrice'), priceUnit()),
    address: toStr(pick(row, 'address')),
    distance: toStr(pick(row, 'distance')),
    tags: parseJsonOrArray(pick(row, 'tags')),
    isNew: !!pick(row, 'is_new', 'isNew'),
    description: toStr(pick(row, 'description')),
    businessHours: toStr(pick(row, 'business_hours', 'businessHours')),
    phone: toStr(pick(row, 'phone')),
    flowers: parseJsonOrArray(pick(row, 'flowers', 'flower_ids'))
  }
}

// 对齐 mock prepareShopTrustInfo：根据店名生成信任信息/品牌文案（容错未知列）
export function prepareShopTrustInfo(shop) {
  const next = { ...shop }
  const name = String(shop.name || '')
  const rating = Number(shop.rating || 0)
  const ratingCount = Number(shop.ratingCount || 0)
  next.hasReviews = ratingCount > 0 && rating > 0
  next.displayRating = next.hasReviews ? rating.toFixed(1) + ' ›' : '暂无'
  next.reviewTabText = ratingCount > 0 ? `评价 ${ratingCount}` : '评价'
  const sales = Number(shop.monthSales || 0)
  next.displaySales = sales > 0 ? `月售${sales}` : (shop.flowers && shop.flowers.length ? `在售${shop.flowers.length}款` : '近期上新')
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

/** 评价行 → 前端评价形状 */
export function mapReviewRow(row) {
  return {
    user: toStr(pick(row, 'user', 'username', 'nickname')) || '微信用户',
    rating: Number(pick(row, 'rating', 'score')) || 5,
    content: toStr(pick(row, 'content', 'comment')),
    date: toStr(pick(row, 'date', 'created_at', 'create_time')),
    tags: parseJsonOrArray(pick(row, 'tags'))
  }
}

/** 用户行 → 安全的前端用户形状（脱敏，不含密码/openid 明文） */
export function mapUserRow(row) {
  const phone = toStr(pick(row, 'phone', 'mobile'))
  const openid = toStr(pick(row, 'openid'))
  return {
    id: toStr(pick(row, 'id', 'user_id')),
    openid: openid ? '***' : '',
    nickname: toStr(pick(row, 'nickname', 'name', 'user_name')),
    avatar: pick(row, 'avatar', 'headimgurl', 'avatar_url') || '',
    phone: phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
    gender: Number(pick(row, 'gender')) || 0,
    country: toStr(pick(row, 'country')),
    province: toStr(pick(row, 'province')),
    city: toStr(pick(row, 'city')),
    status: Number(pick(row, 'status')) || 1,
    registerTime: toStr(pick(row, 'register_time', 'created_at', 'create_time')),
    lastLoginTime: toStr(pick(row, 'last_login_time', 'last_login')),
    updatedAt: toStr(pick(row, 'updated_at'))
  }
}
