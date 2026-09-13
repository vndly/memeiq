/**
 * Application routes.
 * History mode — the server must rewrite all paths to /index.html.
 */
import {createRouter, createWebHistory} from 'vue-router'
import BlankScreen from '@/components/screens/blank_screen.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: BlankScreen,
    },
  ],
})

export default router
