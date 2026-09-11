<template>
  <div class="page">
    <NavBar title="领券中心" />

    <div class="coupon-list">
      <div class="coupon-card" v-for="c in templates" :key="c.id">
        <div class="cc-left">
          <div class="cc-amount"><span class="cc-symbol">¥</span>{{ money(c.value) }}</div>
          <div class="cc-threshold">{{ c.threshold ? '满' + money(c.threshold) + '可用' : '无门槛' }}</div>
        </div>
        <div class="cc-mid">
          <div class="cc-title">{{ c.title }}</div>
          <div class="cc-desc">{{ c.desc }}</div>
          <div class="cc-tag" v-if="c.tag">{{ c.tag }}</div>
        </div>
        <div class="cc-right">
          <button class="cc-btn" v-if="!claimed(c.id)" @click="claim(c.id)">立即领取</button>
          <button class="cc-btn cc-btn-done" v-else disabled>已领取</button>
        </div>
      </div>
    </div>

    <div class="tip">
      优惠券领取后可用于结算抵扣。<br />
      当前为本地版（领取/展示均在本地），正式核销待后端券接口上线。
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { COUPON_TEMPLATES, claimCoupon, isCouponClaimed, money } from '@/store'
import { toast } from '@/utils/toast'

const templates = COUPON_TEMPLATES

function claimed(id) {
  return isCouponClaimed(id)
}
function claim(id) {
  if (claimCoupon(id)) toast('领取成功，去「我的优惠券」查看')
  else toast('该券已领取')
}

</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}
.coupon-list {
  padding: rpx(24);
  display: flex;
  flex-direction: column;
  gap: rpx(20);
}
.coupon-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.cc-left {
  width: rpx(200);
  background: var(--primary-gradient);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(40) 0;
  align-self: stretch;
}
.cc-amount { font-size: rpx(56); font-weight: 800; line-height: 1; }
.cc-symbol { font-size: rpx(28); margin-right: rpx(4); }
.cc-threshold { font-size: rpx(20); opacity: 0.9; margin-top: rpx(10); }
.cc-mid {
  flex: 1;
  padding: rpx(24) rpx(20);
  min-width: 0;
}
.cc-title { font-size: rpx(30); font-weight: 700; color: var(--text-primary); }
.cc-desc { font-size: rpx(22); color: var(--text-secondary); margin-top: rpx(8); }
.cc-tag {
  display: inline-block;
  margin-top: rpx(12);
  font-size: rpx(20);
  color: var(--primary);
  border: rpx(1) solid var(--primary);
  border-radius: rpx(6);
  padding: rpx(2) rpx(10);
}
.cc-right { padding: rpx(24); }
.cc-btn {
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(14) rpx(28);
  border-radius: rpx(999);
}
.cc-btn-done { background: var(--bg); color: var(--text-light); }
.tip {
  margin: rpx(24) rpx(36);
  font-size: rpx(22);
  color: var(--text-light);
  line-height: 1.7;
}
</style>
