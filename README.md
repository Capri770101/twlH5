# 跳舞兰AI花店 · H5

小程序（`miniapp/`）视觉风格的 H5 移植版。技术栈：Vue 3 + Vite + Sass，数据走 mock。

## 启动

```bash
npm install
npm run dev      # http://localhost:5180
npm run build
```

## 移植规则（重要）

### 1. 尺寸：rpx → rem

小程序的 `rpx` 基于 **750 设计稿**。H5 里约定 `1rem = 容器宽度`（上限 480px，见 `index.html` 的 `setRem`），因此：

```
n rpx = n / 750 rem
```

写样式时用 Sass 函数 `rpx()`：

```scss
.card { width: rpx(280); }   // → 0.3733rem → 375 屏上 = 140px
```

> `rpx()` 由 `vite.config.js` 的 `additionalData` 全局注入，任何 `.scss` 和 `.vue` 的 `<style lang="scss">` 里都能直接用。
>
> **例外**：CSS 自定义属性（`--xxx`）的值 Sass 不会计算，必须用 `calc(n * var(--rpx))` 的写法，见 `src/styles/tokens.scss`。

### 2. 字号：不要用变量，直接写数值

小程序 `app.wxss` 定义了 `--font-xs` ~ `--font-title`，但**26 个页面里 651 处 `font-size` 全是硬编码 rpx，变量一次都没用**。所以移植时按实际频率固化即可：

| 用途 | rpx | 字重 |
|---|---|---|
| 大标题 / 价格 | 40 / 48 | 700 |
| 标题、按钮 | 28 | 600 |
| 正文 | 26 | 400 |
| 次要说明 | 24 | 400 |
| 辅助、标签 | 22 / 20 | 400 |

字重只有三档：**400 / 600 / 700**。

### 3. 图标：emoji + CSS 伪元素，没有 iconfont

小程序不依赖任何图标字体，全部是：

- **emoji**：🌸 ⌖ ⌂ ⭐ ✓ ↗ 等
- **CSS 伪元素画的线稿**（4rpx 描边 + `currentColor`）：搜索放大镜、定位 pin、返回箭头、右向尖括号

这些已 1:1 复刻在 `src/styles/base.scss` 的「线稿图标」区，直接用 class：`line-search-mark` / `location-pin` / `arrow-back` / `arrow-down` / `arrow-right`。

### 4. 结构映射

| 小程序 | H5 |
|---|---|
| `page` 元素 | `.twd-app` 容器 |
| `wx:for` | `v-for` |
| `wx:if` | `v-if` |
| `<view>` / `<text>` | `<div>` / `<span>` |
| `<image>` | `<img>`（用 `FlowerImage.vue` 包一层，加载失败降级为 emoji） |
| `<scroll-view scroll-x>` | `overflow-x: auto` + `white-space: nowrap` |
| `<swiper>` | `scroll-snap-type: x mandatory` + 定时器自动播放 |
| 原生 `tabBar` | `components/TabBar.vue` |
| 原生导航栏 | `components/NavBar.vue`（sticky，88rpx 高） |
| `position: fixed` 底部栏 | 需额外 `left: 50%; transform: translateX(-50%); width: 1rem` 才能对齐居中容器 |

### 5. 商品图缺失

小程序包里只有 tab 图标和 logo，`/images/flower-*.jpg`、`/images/shop-*.jpg` 都不存在，所以统一走 `FlowerImage` 的 emoji 降级（与小程序的 placeholder 分支一致）。接入真实 CDN 后自动恢复正常。

## 目录

```
src/
  styles/
    _rpx.scss        rpx() 换算函数
    tokens.scss      设计 token（色板 / 圆角 / 间距 / 字号）
    base.scss        reset + 工具类 + 线稿图标
  components/        TabBar / NavBar / FlowerImage / GoodsCard
  pages/             Home（首页）、Detail（详情）、Cart（购物车）、Category（分类）、
                     Checkout（结算）、Orders（订单列表）、OrderDetail（订单详情）、
                     ShopDetail（店铺详情）、Placeholder（我的·占位）
  mock/              data.js（小程序 mock-data 原样搬运）+ api.js
  store.js           对应 app.js 的 globalData（购物车 / 地址 / 登录态）
```

## 已完成

| 页面 | 路由 | 内容 |
|---|---|---|
| 首页 | `/` | 定位栏、搜索栏、Banner 轮播、同城花店横滑、场景分类、推荐花束 |
| 分类/选花 | `/category` | 搜索（花束+花店）、分类 Tab、综合/销量/价格排序、两列网格、直接加购 |
| 商品详情 | `/detail/:id` | 大图、价格区、适合场景、花材、花语、描述、服务承诺、商品信息、底部操作栏 |
| 购物车 | `/cart` | 按店铺分组、步进器、删除、空状态、底部结算栏 |
| 结算 | `/checkout` | 配送/自提切换、收货信息、配送时段、贺卡（留白/代写+场景标签+AI 建议）、备注、费用明细（满 200 减 20）、底部提交栏，提交后建单并清购物车跳转订单详情 |
| 订单列表 | `/orders` | 全部/待付款/制作中/配送中/已完成/待评价/退款 8 Tab，状态色、操作按钮、空/加载态 |
| 订单详情 | `/order/:id` | 顶部状态卡（按状态渐变）、配送信息、商品、费用、订单信息（复制单号）、评价区 |
| 我的（占位） | `/profile` | 入口链到订单/购物车 |
| 店铺详情 | `/shop/:id` | hero（封面/品牌 slogan/主理人 IP 卡）、联系信息（地址复制/电话拨打/微信复制）、服务承诺、首页（评分销量+本店精选轮播+推荐网格）/全部商品（分类筛选+网格加购）/评价/商家 四 Tab、底部购物车栏；首页「同城花店」点击进入 |

底部 TabBar（首页 / 购物车 / 我的）已完成，购物车角标与详情页加购实时联动。

## 待办

- 地址选择弹窗（首页那套三步式全屏弹窗）
- 手机号验证码登录（适配微信内 + 普通浏览器）
- 接入真实接口 `https://aistore.xiangbinmeigui.com/v1`（需后端开 CORS）

## 两个环境坑

1. **构建时清空 `dist` 会失败**：沙箱的删除拦截会让 `vite build` 在 `emptyOutDir` 阶段报错。构建前先手动删掉 `dist` 目录即可，不是代码问题。
2. **Sass 注释里别写 `#{}`**：会被当成插值解析并报 `Expected expression`。
