import { createRouter, createWebHistory } from 'vue-router';
import { session, logout } from './store.js';
import { loadSession } from './api.js';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', redirect: '/calendario' },
  { path: '/calendario', component: () => import('./views/CalendarView.vue') },
  { path: '/solicitudes', component: () => import('./views/RequestsView.vue') },
  { path: '/revisar', component: () => import('./views/ReviewView.vue'), meta: { roles: ['admin', 'jefe'] } },
  { path: '/admin', component: () => import('./views/AdminView.vue'), meta: { roles: ['admin'] } },
  { path: '/:pathMatch(.*)*', redirect: '/calendario' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!session.token) return { path: '/login', query: { next: to.fullPath } };
  if (!session.user) {
    try {
      await loadSession();
    } catch {
      logout();
      return '/login';
    }
  }
  if (to.meta.roles && !to.meta.roles.includes(session.user.role)) return '/calendario';
  return true;
});

export default router;
