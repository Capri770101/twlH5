// 跳舞兰AI花店 - Mock数据
// 价格单位：分（整数）

/**
 * 为花束/商品项注入WXML安全的衍生字段
 * WXML不支持 {{ }} 中的 > 比较符和 .toFixed() 方法调用，
 * 所以需要在JS层预计算这些值
 */
function enrichFlowerItem(item, opts) {
  if (!item) return item
  const price = item.price || 0
  const originalPrice = item.originalPrice || 0
  const hasDiscount = originalPrice > price
  const enriched = Object.assign({}, item, {
    // 原有字段（保留兼容）
    _hasDiscount: hasDiscount,
    _discountRate: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0,
    _statusClass: (item.stock || 0) > 0 ? 'on' : 'off',
    _statusText: (item.stock || 0) > 0 ? '上架中' : '已下架',
    _canReduce: (item.quantity || 1) > 1,
    // WXML安全字段（避免 .toFixed() / || / > 等表达式）
    img: (item.images && item.images.length) ? item.images[0] : (item.image || ''),
    priceText: (price / 100).toFixed(2),
    originalText: (originalPrice / 100).toFixed(2),
    showOriginal: hasDiscount,
    salesText: item.sales || 0,
    hasDiscount: hasDiscount,
    discountRate: hasDiscount ? Math.round((1 - price / originalPrice) * 100) : 0
  })
  // 热销排名角标
  if (opts && opts.index !== undefined && opts.index < 3) {
    enriched.rankFlag = String(opts.index + 1)
  }
  return enriched
}

/**
 * 批量 enrichment
 */
function enrichFlowerList(list) {
  if (!list || !Array.isArray(list)) return []
  return list.map((item, idx) => enrichFlowerItem(item, { index: idx }))
}

const mockData = {
  // ========== 分类 ==========
  categories: [
    { id: '1', name: '店铺热销', icon: '🔥', color: '#FF6B6B' },
    { id: '2', name: '生日鲜花', icon: '🎂', color: '#FFA94D' },
    { id: '3', name: '向日葵花', icon: '🌻', color: '#748FFC' },
    { id: '4', name: '高端花礼', icon: '💐', color: '#51CF66' },
    { id: '5', name: '时尚新款', icon: '✨', color: '#DA77F2' },
    { id: '6', name: '男士花束', icon: '💼', color: '#4ECDC4' },
    { id: '7', name: '求婚告白', icon: '💍', color: '#FFD43B' },
    { id: '8', name: '长辈专区', icon: '🌷', color: '#B197FC' },
    { id: '9', name: '开业花篮', icon: '🎉', color: '#20C997' },
    { id: '10', name: '家居鲜花', icon: '🏠', color: '#82C91E' },
    { id: '11', name: '鲜花配件', icon: '🎁', color: '#F06595' },
    { id: '8', name: '全部花束', icon: '🌷', color: '#E8615D' }
  ],

  // ========== 花束商品 ==========
  flowers: [
    {
      id: 'f001',
      name: '心动告白',
      subtitle: '11朵厄瓜多尔红玫瑰',
      categoryId: '1',
      tags: ['热销', '表白必备'],
      price: 19900,
      originalPrice: 35900,
      image: '/images/flower-rose-red.jpg',
      images: [],
      description: '精选11朵厄瓜多尔进口红玫瑰，搭配满天星与尤加利叶。每朵玫瑰均由花艺师精心挑选，确保新鲜绽放。经典表白之选，11朵寓意"一心一意"。',
      flowers: ['红玫瑰 x11', '满天星', '尤加利叶'],
      flowerMeaning: '热烈的爱，一心一意',
      season: '四季',
      shelfLife: '7-10天',
      stock: 99,
      sales: 1523,
      rating: 4.9
    },
    {
      id: 'f002',
      name: '温柔初恋',
      subtitle: '粉玫瑰+白桔梗花束',
      categoryId: '1',
      tags: ['清新', '告白'],
      price: 25900,
      originalPrice: 29900,
      image: '/images/flower-pink-rose.jpg',
      images: [],
      description: '粉玫瑰6朵搭配白桔梗，点缀洋甘菊与尤加利叶。粉色温柔如初恋，适合送给心动的TA。',
      flowers: ['粉玫瑰 x6', '白桔梗 x5', '洋甘菊', '尤加利叶'],
      flowerMeaning: '温柔的爱，初恋的心动',
      season: '春/夏',
      shelfLife: '5-7天',
      stock: 86,
      sales: 1208,
      rating: 4.8
    },
    {
      id: 'f003',
      name: '阳光祝福',
      subtitle: '6朵向日葵花束',
      categoryId: '2',
      tags: ['生日', '祝福'],
      price: 19900,
      originalPrice: 23900,
      image: '/images/flower-sunflower.jpg',
      images: [],
      description: '6朵灿烂向日葵，搭配黄莺与绿叶。向日葵代表阳光与希望，是生日祝福的最佳选择。',
      flowers: ['向日葵 x6', '黄莺', '绿叶'],
      flowerMeaning: '阳光、希望、忠诚的爱',
      season: '夏/秋',
      shelfLife: '7-10天',
      stock: 120,
      sales: 980,
      rating: 4.7
    },
    {
      id: 'f004',
      name: '真挚歉意',
      subtitle: '6朵白百合花束',
      categoryId: '3',
      tags: ['道歉', '真诚'],
      price: 26900,
      originalPrice: 31900,
      image: '/images/flower-lily.jpg',
      images: [],
      description: '6朵纯白百合，搭配勿忘我与尤加利叶。百合象征纯洁与真诚，白百合代表歉意与和好。',
      flowers: ['白百合 x6', '勿忘我', '尤加利叶'],
      flowerMeaning: '纯洁、真诚、请求原谅',
      season: '四季',
      shelfLife: '7-10天',
      stock: 65,
      sales: 756,
      rating: 4.8
    },
    {
      id: 'f005',
      name: '温馨关怀',
      subtitle: '康乃馨混搭花束',
      categoryId: '4',
      tags: ['探病', '关怀'],
      price: 18900,
      originalPrice: 22900,
      image: '/images/flower-carnation.jpg',
      images: [],
      description: '粉色康乃馨8朵搭配洋桔梗，温馨柔和。康乃馨寓意健康与关爱，适合探望病人或长辈。',
      flowers: ['粉色康乃馨 x8', '洋桔梗 x5', '绿叶'],
      flowerMeaning: '健康、关爱、温馨祝福',
      season: '四季',
      shelfLife: '7-10天',
      stock: 78,
      sales: 634,
      rating: 4.7
    },
    {
      id: 'f006',
      name: '浪漫婚礼',
      subtitle: '白玫瑰+绣球手捧花',
      categoryId: '5',
      tags: ['婚礼', '手捧花'],
      price: 59900,
      originalPrice: 69900,
      image: '/images/flower-wedding.jpg',
      images: [],
      description: '白玫瑰12朵搭配蓝色绣球花，精致手捧花设计。纯白与蓝的碰撞，如梦幻婚礼般浪漫。',
      flowers: ['白玫瑰 x12', '蓝色绣球 x3', '满天星', '尤加利叶'],
      flowerMeaning: '纯洁的爱、永恒的幸福',
      season: '四季',
      shelfLife: '5-7天',
      stock: 30,
      sales: 412,
      rating: 5.0
    },
    {
      id: 'f007',
      name: '好运连连',
      subtitle: '郁金香+洋牡丹花束',
      categoryId: '6',
      tags: ['商务', '开业'],
      price: 32900,
      originalPrice: 38900,
      image: '/images/flower-tulip.jpg',
      images: [],
      description: '紫色郁金香8朵搭配白色洋牡丹，高雅大气。适合商务拜访、开业庆典等正式场合。',
      flowers: ['紫色郁金香 x8', '白色洋牡丹 x6', '绿叶'],
      flowerMeaning: '高贵、成功、好运连连',
      season: '春/冬',
      shelfLife: '5-7天',
      stock: 45,
      sales: 523,
      rating: 4.9
    },
    {
      id: 'f008',
      name: '紫色迷情',
      subtitle: '薰衣草+紫玫瑰混搭',
      categoryId: '7',
      tags: ['家居', '装饰'],
      price: 35900,
      originalPrice: 41900,
      image: '/images/flower-lavender.jpg',
      images: [],
      description: '紫玫瑰5朵搭配薰衣草与尤加利叶，紫色系混搭花束。优雅迷人，为家居增添浪漫气息。',
      flowers: ['紫玫瑰 x5', '薰衣草', '尤加利叶'],
      flowerMeaning: '浪漫、优雅、等待爱情',
      season: '四季',
      shelfLife: '7-10天',
      stock: 55,
      sales: 389,
      rating: 4.8
    }
  ],

  // ========== 首页数据 ==========
  homeData: {
    banners: [
      {
        id: 'b1',
        image: '/images/banner-1.jpg',
        title: '跳舞兰AI花店',
        subtitle: '家门口的实体花店，新鲜现包当日送',
        desc: '拒绝网图假货，全部门店实拍出品',
        color: '#E8615D',
        link: ''
      },
      {
        id: 'b2',
        image: '/images/banner-2.jpg',
        title: '品质花店',
        subtitle: '精选附近实体花店，鲜花现包当日送',
        color: '#4ECDC4',
        link: '/pages/shop-list/shop-list'
      },
      {
        id: 'b3',
        image: '/images/banner-3.jpg',
        title: '新店入驻',
        subtitle: '花店免费入驻，AI赋能',
        color: '#748FFC',
        link: '/pages/apply-shop/apply-shop'
      }
    ],
    categories: [
      { id: '1', name: '店铺热销', icon: '🔥', color: '#FF6B6B' },
      { id: '2', name: '生日鲜花', icon: '🎂', color: '#FFA94D' },
      { id: '3', name: '向日葵花', icon: '🌻', color: '#748FFC' },
      { id: '4', name: '高端花礼', icon: '💐', color: '#51CF66' },
      { id: '5', name: '时尚新款', icon: '✨', color: '#DA77F2' },
      { id: '6', name: '男士花束', icon: '💼', color: '#4ECDC4' },
      { id: '7', name: '求婚告白', icon: '💍', color: '#FFD43B' },
      { id: '8', name: '长辈专区', icon: '🌷', color: '#B197FC' },
      { id: '9', name: '开业花篮', icon: '🎉', color: '#20C997' },
      { id: '10', name: '家居鲜花', icon: '🏠', color: '#82C91E' },
      { id: '11', name: '鲜花配件', icon: '🎁', color: '#F06595' },
      { id: '8', name: '全部花束', icon: '🌷', color: '#E8615D' }
    ]
  },

  // ========== 花店数据 ==========
  shops: [
    {
      id: 's001',
      name: '盐田花语鲜花店',
      avatar: '/images/shop-avatar-1.jpg',
      cover: '/images/shop-cover-1.jpg',
      rating: 4.9,
      ratingCount: 328,
      monthSales: 856,
      deliveryTime: '约45分钟',
      deliveryFee: 0,
      minOrderPrice: 9900,
      address: '深圳市盐田区海山路18号',
      distance: '1.2km',
      tags: ['品质花店', '回头客多'],
      isNew: false,
      description: '盐田花语鲜花店成立于2018年，专注高端花艺设计。花艺师均有5年以上经验，每一束花都是艺术品。',
      businessHours: '08:00-22:00',
      phone: '13800138001',
      flowers: ['f001', 'f002', 'f003', 'f004', 'f007', 'f008']
    },
    {
      id: 's002',
      name: '海山花坊',
      avatar: '/images/shop-avatar-2.jpg',
      cover: '/images/shop-cover-2.jpg',
      rating: 4.7,
      ratingCount: 215,
      monthSales: 623,
      deliveryTime: '约50分钟',
      deliveryFee: 0,
      minOrderPrice: 9900,
      address: '深圳市盐田区沙盐路66号',
      distance: '2.5km',
      tags: ['新店开业', '优惠多'],
      isNew: true,
      description: '海山花坊——盐田新兴花艺品牌，主打年轻化设计风格，价格亲民品质不妥协。',
      businessHours: '09:00-21:00',
      phone: '13800138002',
      flowers: ['f001', 'f003', 'f005', 'f006']
    },
    {
      id: 's003',
      name: '盐田口岸花店',
      avatar: '/images/shop-avatar-3.jpg',
      cover: '/images/shop-cover-3.jpg',
      rating: 4.8,
      ratingCount: 186,
      monthSales: 512,
      deliveryTime: '约35分钟',
      deliveryFee: 0,
      minOrderPrice: 9900,
      address: '深圳市盐田区深盐路200号',
      distance: '3.1km',
      tags: ['进口花材', '高端定制'],
      isNew: false,
      description: '口岸花店依托盐田口岸优势，直供进口花材，品质有保障。提供高端花束定制服务。',
      businessHours: '08:30-21:30',
      phone: '13800138003',
      flowers: ['f002', 'f004', 'f006', 'f007', 'f008']
    },
    {
      id: 's004',
      name: '梧桐花舍',
      avatar: '/images/shop-avatar-4.jpg',
      cover: '/images/shop-cover-4.jpg',
      rating: 4.6,
      ratingCount: 142,
      monthSales: 398,
      deliveryTime: '约55分钟',
      deliveryFee: 0,
      minOrderPrice: 9900,
      address: '深圳市盐田区梧桐路88号',
      distance: '4.8km',
      tags: ['田园风格', '小众花材'],
      isNew: true,
      description: '梧桐花舍隐匿于梧桐山脚下，主打自然田园风格花艺，选用当季本地花材，清新自然。',
      businessHours: '09:30-20:00',
      phone: '13800138004',
      flowers: ['f001', 'f003', 'f005']
    }
  ],

  // ========== 城市与区域 ==========
  cities: [
    { name: '深圳', code: '0755' },
    { name: '广州', code: '020' },
    { name: '北京', code: '010' },
    { name: '上海', code: '021' },
    { name: '杭州', code: '0571' },
    { name: '成都', code: '028' }
  ],
  locations: [
    // 深圳
    { id: 'l001', name: '盐田区', area: '盐田', city: '深圳' },
    { id: 'l002', name: '南山区', area: '南山', city: '深圳' },
    { id: 'l003', name: '福田区', area: '福田', city: '深圳' },
    { id: 'l004', name: '罗湖区', area: '罗湖', city: '深圳' },
    { id: 'l005', name: '龙岗区', area: '龙岗', city: '深圳' },
    { id: 'l006', name: '宝安区', area: '宝安', city: '深圳' },
    // 广州
    { id: 'l007', name: '天河区', area: '天河', city: '广州' },
    { id: 'l008', name: '越秀区', area: '越秀', city: '广州' },
    { id: 'l009', name: '海珠区', area: '海珠', city: '广州' },
    { id: 'l010', name: '白云区', area: '白云', city: '广州' },
    // 北京
    { id: 'l011', name: '朝阳区', area: '朝阳', city: '北京' },
    { id: 'l012', name: '海淀区', area: '海淀', city: '北京' },
    { id: 'l013', name: '东城区', area: '东城', city: '北京' },
    // 上海
    { id: 'l014', name: '浦东新区', area: '浦东', city: '上海' },
    { id: 'l015', name: '徐汇区', area: '徐汇', city: '上海' },
    { id: 'l016', name: '静安区', area: '静安', city: '上海' },
    // 杭州
    { id: 'l017', name: '西湖区', area: '西湖', city: '杭州' },
    { id: 'l018', name: '滨江区', area: '滨江', city: '杭州' },
    // 成都
    { id: 'l019', name: '锦江区', area: '锦江', city: '成都' },
    { id: 'l020', name: '武侯区', area: '武侯', city: '成都' },
    { id: 'l021', name: '高新区', area: '高新', city: '成都' }
  ],

  // ========== 订单 ==========
  orders: [
    {
      id: '20260528001',
      status: 'completed',
      statusText: '已完成',
      items: [
        { id: 'f001', name: '心动告白', image: '/images/flower-rose-red.jpg', price: 29900, quantity: 1 }
      ],
      totalPrice: 29900,
      deliveryFee: 0,
      createTime: '2026-05-28 14:30:00',
      payTime: '2026-05-28 14:32:00',
      address: { name: '张先生', phone: '138****8001', detail: '深圳市南山区科技园南路88号 3栋1201' },
      deliveryInfo: { rider: '李师傅', phone: '138****9001', estimatedTime: '约15:20送达' }
    },
    {
      id: '20260530002',
      status: 'delivering',
      statusText: '配送中',
      items: [
        { id: 'f003', name: '阳光祝福', image: '/images/flower-sunflower.jpg', price: 19900, quantity: 1 },
        { id: 'f005', name: '温馨关怀', image: '/images/flower-carnation.jpg', price: 18900, quantity: 1 }
      ],
      totalPrice: 38800,
      deliveryFee: 0,
      createTime: '2026-05-30 10:15:00',
      payTime: '2026-05-30 10:16:00',
      address: { name: '李女士', phone: '138****8002', detail: '深圳市福田区华强北路1号 15楼' },
      deliveryInfo: { rider: '王师傅', phone: '138****9002', estimatedTime: '约11:00送达' }
    },
    {
      id: '20260603003',
      status: 'pending',
      statusText: '待付款',
      items: [
        { id: 'f002', name: '温柔初恋', image: '/images/flower-lily.jpg', price: 25900, quantity: 2 }
      ],
      totalPrice: 51800,
      deliveryFee: 0,
      createTime: '2026-06-03 22:52:00',
      address: { name: '赵小姐', phone: '139****3003', detail: '深圳市宝安区新安街道裕安居 8栋603' },
      expectDeliveryTime: '2026-06-04 12:00'
    },
    {
      id: '20260604004',
      status: 'pending',
      statusText: '待付款',
      items: [
        { id: 'f004', name: '紫色迷情', image: '/images/flower-lavender.jpg', price: 35900, quantity: 1 }
      ],
      totalPrice: 35900,
      deliveryFee: 0,
      createTime: '2026-06-04 18:20:00',
      address: { name: '周先生', phone: '137****4004', detail: '深圳市罗湖区深南东路2001号 长富金茂大厦' },
      expectDeliveryTime: '2026-06-05 09:00'
    },
    {
      id: '20260605005',
      status: 'new',
      statusText: '待接单',
      items: [
        { id: 'f001', name: '心动告白', image: '/images/flower-rose-red.jpg', price: 29900, quantity: 1 },
        { id: 'f006', name: '生日快乐', image: '/images/flower-birthday.jpg', price: 18800, quantity: 1 }
      ],
      totalPrice: 48700,
      deliveryFee: 0,
      createTime: '2026-06-05 01:52:00',
      address: { name: '陈女士', phone: '136****5005', detail: '深圳市龙岗区坂田街道五和大道 12号' },
      expectDeliveryTime: '2026-06-05 10:00'
    },
    {
      id: '20260605006',
      status: 'making',
      statusText: '制作中',
      items: [
        { id: 'f007', name: '母爱如山', image: '/images/flower-carnation.jpg', price: 22800, quantity: 1 }
      ],
      totalPrice: 22800,
      deliveryFee: 0,
      createTime: '2026-06-05 08:30:00',
      payTime: '2026-06-05 08:31:00',
      address: { name: '林女士', phone: '135****6006', detail: '深圳市盐田区海景路 1号 海景花园A座' },
      deliveryInfo: { rider: '', phone: '', estimatedTime: '预计11:00送达' },
      expectDeliveryTime: '2026-06-05 11:00'
    },
    {
      id: '20260525007',
      status: 'refunded',
      statusText: '已退款',
      items: [
        { id: 'f002', name: '温柔初恋', image: '/images/flower-lily.jpg', price: 25900, quantity: 1 }
      ],
      totalPrice: 25900,
      deliveryFee: 0,
      createTime: '2026-05-25 16:40:00',
      payTime: '2026-05-25 16:41:00',
      address: { name: '吴先生', phone: '138****7007', detail: '深圳市龙华区民治大道188号' },
      refundTime: '2026-06-01 10:20:00'
    }
  ],

  // ========== 商家仪表盘 ==========
  dashboardData: {
    todayOrders: 12,
    todayRevenue: 358000,
    monthOrders: 286,
    monthRevenue: 8560000,
    totalProducts: 48,
    recentOrders: [
      { id: '20260602001', customer: '王先生', items: '心动告白 x1', price: 29900, time: '10:30', status: 'new' },
      { id: '20260602002', customer: '陈女士', items: '阳光祝福 x1', price: 19900, time: '09:15', status: 'making' },
      { id: '20260601003', customer: '刘先生', items: '紫色迷情 x1', price: 35900, time: '18:20', status: 'completed' }
    ],
    salesChart: [
      { date: '05-27', amount: 850000 },
      { date: '05-28', amount: 1200000 },
      { date: '05-29', amount: 680000 },
      { date: '05-30', amount: 1560000 },
      { date: '05-31', amount: 2100000 },
      { date: '06-01', amount: 980000 },
      { date: '06-02', amount: 1420000 }
    ]
  },

  // ========== 商家订单 ==========
  merchantOrders: [
    {
      id: '20260602001',
      customerName: '王先生',
      phone: '138****8001',
      items: [{ name: '心动告白', image: '/images/flower-rose-red.jpg', price: 29900, quantity: 1 }],
      totalPrice: 29900,
      status: 'new',
      statusText: '待处理',
      createTime: '2026-06-02 10:30',
      address: { name: '王先生', phone: '138****8001', detail: '深圳市盐田区海山路18号 5栋302' }
    },
    {
      id: '20260602002',
      customerName: '陈女士',
      phone: '138****8002',
      items: [{ name: '阳光祝福', image: '/images/flower-sunflower.jpg', price: 19900, quantity: 1 }],
      totalPrice: 19900,
      status: 'making',
      statusText: '制作中',
      createTime: '2026-06-02 09:15',
      address: { name: '陈女士', phone: '138****8002', detail: '深圳市盐田区沙盐路66号 7栋101' }
    },
    {
      id: '20260601003',
      customerName: '刘先生',
      phone: '138****8003',
      items: [{ name: '紫色迷情', image: '/images/flower-lavender.jpg', price: 35900, quantity: 1 }],
      totalPrice: 35900,
      status: 'completed',
      statusText: '已完成',
      createTime: '2026-06-01 18:20',
      address: { name: '刘先生', phone: '138****8003', detail: '深圳市盐田区深盐路200号 12楼' }
    }
  ]
}

export default Object.assign(mockData, {
  enrichFlowerItem,
  enrichFlowerList
})
