/**
 * Application routes.
 * History mode — the server must rewrite all paths to /index.html.
 */
import {createRouter, createWebHistory} from 'vue-router'
import MainScreen from '@/components/screens/main_screen.vue'
import MatchScreen from '@/components/screens/match_screen.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: MainScreen,
    },
    {
      path: '/match',
      name: 'match',
      component: MatchScreen,
    },
  ],
})

export default router
