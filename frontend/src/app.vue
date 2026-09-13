<script setup lang="ts">
import {onMounted} from 'vue'
import LoadingScreen from '@/components/screens/loading_screen.vue'
import {catalogueError, fetchMemeCatalogue, isCatalogueLoading} from '@/services/meme_catalogue'

onMounted(() => {
  void fetchMemeCatalogue()
})
</script>

<template>
  <LoadingScreen v-if="isCatalogueLoading || catalogueError !== null" />
  <RouterView v-else />
</template>
