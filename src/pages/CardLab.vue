<template>
  <div class="lab">
    <NavBar title="卡片自检 · 开发态" />

    <div class="lab-bar">
      <span class="lab-tag">DEV</span>
      <span class="lab-tip">离线渲染 8 类结构化卡片，无需数据库。点击按钮仅打日志，不会真跳转。</span>
    </div>

    <section v-for="grp in groups" :key="grp.key" class="lab-sec">
      <h3 class="lab-h">{{ grp.title }}</h3>
      <div class="lab-msg">
        <div class="avatar ai">AI</div>
        <div class="bubble">
          <AdvisorCards :card="grp.card" @buy="onBuy" @send="onSend" @pay="onPay" @order="onOrder" @view-order="onViewOrder" />
        </div>
      </div>
    </section>

    <!-- 文本气泡单独演示 -->
    <section class="lab-sec">
      <h3 class="lab-h">text 文本气泡</h3>
      <div class="lab-msg">
        <div class="avatar ai">AI</div>
        <div class="bubble"><div class="msg-text">好的，已为你挑选以下花束，看看喜欢哪款？</div></div>
      </div>
    </section>

    <section class="lab-sec">
      <h3 class="lab-h">如何测「真实生图」</h3>
      <div class="lab-note">
        <p>生图卡（image_task）的真实图片来自智能体平台，需平台真的产一张图。自检页上方「image_task · 已出图」用的是占位 SVG 演示版式。</p>
        <p>要在真实链路验证：打开 <b>/advisor</b>，发送例如 <b>「帮我生成一张生日花束的效果图」</b>，平台会返回 <code>image_task</code> 事件，卡片进入「生成中…」并自动轮询 <code>/tasks/{id}</code>，出图后自动回填。</p>
        <p>我们已实测过流式与卡片事件（plan_card / order_card 均返回真实商品），生图轮询机制同源可用，缺的只是平台侧一次真实出图。</p>
        <button class="lab-go" @click="goAdvisor">打开真实顾问页 →</button>
      </div>
    </section>

    <div class="tabbar-placeholder"></div>
  </div>
</template>

<script setup>
import NavBar from '@/components/NavBar.vue'
import AdvisorCards from '@/components/AdvisorCards.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 占位「生成图」：内联 SVG，离线可渲染，演示 image_task 已出图版式
const SAMPLE_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280">' +
      '<rect width="400" height="280" fill="#f7e9e4"/>' +
      '<g fill="#e8615d"><circle cx="120" cy="120" r="30"/><circle cx="200" cy="100" r="34"/><circle cx="280" cy="130" r="28"/></g>' +
      '<g fill="#f4c542"><circle cx="160" cy="160" r="18"/><circle cx="240" cy="170" r="18"/></g>' +
      '<rect x="190" y="150" width="20" height="110" fill="#3f8f68"/>' +
      '<text x="200" y="262" font-size="18" fill="#b08a76" text-anchor="middle">示例效果图（占位）</text>' +
      '</svg>'
  )

const groups = [
  {
    key: 'plan',
    title: 'plan_card 方案卡',
    card: {
      ui: 'plan_card',
      data: {
        plans: [
          { id: 'p1', name: '网红Kitty玫瑰心动桶', price: 198, image: '', desc: '红玫瑰 + 碎冰蓝，甜酷风', stock: 99, merchant_name: '千百度花坊' },
          { id: 'p2', name: '春日来信·郁金香花束', price: 128, image: '', desc: '进口郁金香 11 支', stock: 0, merchant_name: '' },
          { id: 'p3', name: '暖阳向日葵', price: 0, image: '', desc: '到店咨询', stock: 5, merchant_name: '百花园' }
        ]
      }
    }
  },
  {
    key: 'order',
    title: 'order_card 订单卡',
    card: {
      ui: 'order_card',
      data: {
        order_id: 'TW20260908001',
        items: [
          { name: '网红Kitty玫瑰心动桶', qty: 1, price: 198 },
          { name: '手写贺卡', qty: 1, price: 9.9 }
        ],
        total_price: 207.9,
        plan_type: 'diy'
      }
    }
  },
  {
    key: 'shop',
    title: 'shop_card 店铺卡',
    card: {
      ui: 'shop_card',
      data: {
        shops: [
          { shop_id: 's001', name: '千百度花坊', rating: 5.0, distance_km: 1.2, price_range: '¥100-300' },
          { shop_id: 's005', name: '百花园', rating: 4.6, distance_km: 3.5, price_range: '¥80-200' }
        ]
      }
    }
  },
  {
    key: 'pay',
    title: 'pay_jump 支付卡',
    card: { ui: 'pay_jump', data: { order_id: 'TW20260908001', total_price: 207.9 } }
  },
  {
    key: 'task_loading',
    title: 'image_task 生图卡 · 生成中',
    card: { ui: 'image_task', data: {} }
  },
  {
    key: 'task_done',
    title: 'image_task 生图卡 · 已出图',
    card: { ui: 'image_task', data: { result_url: SAMPLE_IMG } }
  },
  {
    key: 'greet',
    title: 'greeting_card 贺卡',
    card: {
      ui: 'greeting_card',
      data: { image_url: SAMPLE_IMG, text: '愿你被这世界温柔以待，像这束花一样灿烂。', recipient: '妈妈', sender: '小兰' }
    }
  },
  {
    key: 'opts',
    title: 'dialog_options 选项',
    card: {
      ui: 'dialog_options',
      data: {
        options: [
          { label: '生日花束', value: '我要生日花束' },
          { label: '道歉花束', value: '我要道歉花束' },
          { label: '乔迁送什么', value: '乔迁送什么' }
        ]
      }
    }
  }
]

function onBuy(p) { console.log('[CardLab] buy', p) }
function onSend(v) { console.log('[CardLab] send', v) }
function onPay(p) { console.log('[CardLab] pay', p) }
function onOrder(o) { console.log('[CardLab] order', o) }
function onViewOrder(id) { console.log('[CardLab] view-order', id) }
function goAdvisor() { router.push({ name: 'advisor' }) }
</script>

<style scoped lang="scss">
.lab {
  min-height: 100vh;
  background: #f4f1ed;
  padding-bottom: rpx(40);
}
.lab-bar {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(16) rpx(24);
  background: #fff;
  border-bottom: 1rpx solid #ece7e0;
}
.lab-tag {
  flex: none;
  padding: rpx(4) rpx(12);
  border-radius: rpx(6);
  background: #251f1c;
  color: #fff;
  font-size: rpx(20);
  font-weight: 700;
}
.lab-tip {
  font-size: rpx(21);
  color: #8d8580;
  line-height: 1.4;
}
.lab-sec {
  margin: rpx(20) rpx(24) 0;
}
.lab-h {
  margin: 0 0 rpx(10);
  font-size: rpx(22);
  font-weight: 700;
  color: #a39a93;
}
.lab-msg {
  display: flex;
  gap: rpx(14);
  align-items: flex-start;
}
.avatar {
  flex: none;
  width: rpx(56);
  height: rpx(56);
  border-radius: rpx(14);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(22);
  font-weight: 800;
  color: #fff;
}
.avatar.ai { background: linear-gradient(135deg, #e8615d, #d9745f); }
.bubble {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: rpx(18);
  padding: rpx(16) rpx(18);
  box-shadow: 0 rpx(4) rpx(16) rgba(60, 50, 40, 0.05);
}
.msg-text {
  white-space: pre-wrap;
  font-size: rpx(25);
  color: #332c28;
  line-height: 1.6;
}
.lab-note {
  background: #fff;
  border-radius: rpx(18);
  padding: rpx(18) rpx(20);
  font-size: rpx(23);
  color: #5c524d;
  line-height: 1.7;
  p { margin: 0 0 rpx(12); }
  code {
    background: #f6f3ee;
    padding: rpx(2) rpx(8);
    border-radius: rpx(6);
    font-size: rpx(21);
  }
}
.lab-go {
  margin-top: rpx(6);
  height: rpx(70);
  width: 100%;
  border: none;
  border-radius: rpx(35);
  background: #251f1c;
  color: #fff;
  font-size: rpx(25);
  font-weight: 800;
}
.tabbar-placeholder { height: rpx(120); }
</style>
