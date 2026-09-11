<template>
  <div class="twd-app">
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
    <TabBar v-if="route.meta.tab" />
    <ToastHost />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'
import ToastHost from '@/components/ToastHost.vue'

const route = useRoute()
</script>
