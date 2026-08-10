import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTeamStore } from '../stores/team'
import { useUiStore } from '../stores/ui'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresTeam?: boolean
    requiresManager?: boolean
    publicOnly?: boolean
    layout?: 'auth' | 'app'
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/teams' },

    // --- Public / auth flow -------------------------------------------------
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/auth/LoginView.vue'),
      meta: { publicOnly: true, layout: 'auth' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/auth/RegisterView.vue'),
      meta: { publicOnly: true, layout: 'auth' },
    },
    {
      path: '/verify-email/:token?',
      name: 'verify-email',
      component: () => import('../views/auth/VerifyEmailView.vue'),
      meta: { layout: 'auth' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/auth/ForgotPasswordView.vue'),
      meta: { publicOnly: true, layout: 'auth' },
    },
    {
      path: '/reset-password/:token?',
      name: 'reset-password',
      component: () => import('../views/auth/ResetPasswordView.vue'),
      meta: { publicOnly: true, layout: 'auth' },
    },

    // --- Account (no team context needed) -----------------------------------
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/account/AccountView.vue'),
      meta: { requiresAuth: true, layout: 'app' },
    },

    // --- Team switcher --------------------------------------------------------
    {
      path: '/teams',
      name: 'team-switcher',
      component: () => import('../views/teams/TeamSwitcherView.vue'),
      meta: { requiresAuth: true, layout: 'app' },
    },

    // --- Team-scoped routes -----------------------------------------------
    {
      path: '/teams/:teamId',
      redirect: (to) => `/teams/${to.params.teamId}/time`,
    },
    {
      path: '/teams/:teamId/members',
      name: 'team-members',
      component: () => import('../views/teams/TeamMembersView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/clients',
      name: 'clients',
      component: () => import('../views/clients/ClientsView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/projects',
      name: 'projects',
      component: () => import('../views/projects/ProjectsView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/projects/:projectId',
      name: 'project-detail',
      component: () => import('../views/projects/ProjectDetailView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/time',
      name: 'time',
      component: () => import('../views/time/WeeklyGridView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/approvals',
      name: 'approvals',
      component: () => import('../views/time/ApprovalQueueView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, requiresManager: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/invoices',
      name: 'invoices',
      component: () => import('../views/invoices/MyInvoicesView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/invoices/pool',
      name: 'invoicing-pool',
      component: () => import('../views/invoices/InvoicingPoolView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, requiresManager: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/invoices/:invoiceId',
      name: 'invoice-detail',
      component: () => import('../views/invoices/InvoiceDetailView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/reports',
      name: 'reports',
      component: () => import('../views/reports/ReportsView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, layout: 'app' },
    },
    {
      path: '/teams/:teamId/audit-log',
      name: 'audit-log',
      component: () => import('../views/audit/AuditLogView.vue'),
      meta: { requiresAuth: true, requiresTeam: true, requiresManager: true, layout: 'app' },
    },

    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { layout: 'app' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const team = useTeamStore()
  const ui = useUiStore()

  if (!auth.initialized) {
    await auth.initialize()
  }

  if (to.meta.publicOnly && auth.isAuthenticated) {
    return { name: 'team-switcher' }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresTeam) {
    const teamId = to.params.teamId as string
    if (team.currentTeamId !== teamId) {
      try {
        await team.selectTeam(teamId)
      } catch {
        ui.error('That team could not be found, or you are not a member.')
        return { name: 'team-switcher' }
      }
    }

    if (to.meta.requiresManager && !team.isManager) {
      ui.error('Only team managers can access that page.')
      return { name: 'time', params: { teamId } }
    }
  }

  return true
})
