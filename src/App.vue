<template>
  <div class="twd-app">
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
    <TabBar v-if="route.meta.tab" />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'

const route = useRoute()
</script>
