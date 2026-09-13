import { createRouter, createWebHistory } from 'vue-router'

// App.vue renders the recognition UI directly (it doesn't use <router-view>),
// so this route only needs to exist for path matching / useRoute().
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: { render: () => null },
      meta: { title: '害蟲辨識' },
    },
  ],
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ?? '害蟲辨識'
})

export default router
