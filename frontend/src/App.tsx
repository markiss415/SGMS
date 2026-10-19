/**
 * SMART GARBAGE MONITORING SYSTEM
 * Barangay Bang-Bang, Cordova, Cebu, Philippines
 * Main application shell: public landing page for visitors, role-based workspace for signed-in users.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { LoginModal } from './components/auth/LoginModal';
import { RegisterModal } from './components/auth/RegisterModal';
import { PasswordResetModal } from './components/auth/PasswordResetModal';
import { NotificationsView } from './components/common/NotificationsView';
import { ProfileView } from './components/common/ProfileView';
import { resolveTab } from './config/navigation';

// Admin
import { AdminDashboard } from './components/admin/AdminDashboard';
import { SchedulesManager } from './components/admin/SchedulesManager';
import { HouseholdsManager } from './components/admin/HouseholdsManager';
import { UsersManager } from './components/admin/UsersManager';
import { MonitoringView } from './components/admin/MonitoringView';
import { ReportsView } from './components/admin/ReportsView';
import { AnnouncementsManager } from './components/admin/AnnouncementsManager';
import { SystemSettingsView } from './components/admin/SystemSettingsView';
import { ActivityLogsView } from './components/admin/ActivityLogsView';

// Collector
import { CollectorDashboard } from './components/collector/CollectorDashboard';
import { CollectorTasks } from './components/collector/CollectorTasks';
import { CollectionHistoryView } from './components/collector/CollectionHistoryView';

// Purok Leader
import { LeaderDashboard } from './components/leader/LeaderDashboard';
import { RegistrationsView } from './components/leader/RegistrationsView';
import { DisposalVerificationView } from './components/leader/DisposalVerificationView';
import { PaymentVerificationView } from './components/leader/PaymentVerificationView';
import { EndorsementProcessingView } from './components/leader/EndorsementProcessingView';

// Resident
import { ResidentDashboard } from './components/resident/ResidentDashboard';
import { ResidentDisposalView } from './components/resident/ResidentDisposalView';
import { ResidentPaymentsView } from './components/resident/ResidentPaymentsView';
import { ResidentEndorsementsView } from './components/resident/ResidentEndorsementsView';

import { LandingPage } from './components/public/LandingPage';
// Map (Leaflet) and scanner (camera) code is loaded only when those pages are opened.
const MapView = React.lazy(() => import('./components/field/MapView').then((m) => ({ default: m.MapView })));
const ScannerView = React.lazy(() => import('./components/field/ScannerView').then((m) => ({ default: m.ScannerView })));
import { CollectorGpsTracker } from './components/field/CollectorGpsTracker';
import { MyHouseholdQrView } from './components/resident/MyHouseholdQrView';

const TAB_STORAGE_KEY = 'bb_current_tab';
const HISTORY_MARKER = 'bb_sgms';

interface AppHistoryState {
  app?: string;
  view?: 'landing' | 'workspace';
  tab?: string;
}

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [viewLandingPage, setViewLandingPage] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const historyUserId = useRef<string | null>(null);

  /** Applies a workspace tab without changing browser history (used by Back/Forward). */
  const applyTab = useCallback(
    (tab: string) => {
      if (!user) return null;
      const next = resolveTab(user.role, tab);
      setCurrentTab(next);
      try {
        sessionStorage.setItem(TAB_STORAGE_KEY, `${user.id}:${next}`);
      } catch {
        /* storage unavailable */
      }
      document.getElementById('main-content')?.scrollTo({ top: 0 });
      return next;
    },
    [user]
  );

  /** Normal app navigation creates a real browser-history entry. */
  const navigate = useCallback(
    (tab: string) => {
      const next = applyTab(tab);
      if (!next) return;
      setViewLandingPage(false);
      const state = (window.history.state || {}) as AppHistoryState;
      if (state.app !== HISTORY_MARKER || state.view !== 'workspace' || state.tab !== next) {
        window.history.pushState({ app: HISTORY_MARKER, view: 'workspace', tab: next }, '', `#${next}`);
      }
    },
    [applyTab]
  );

  const showLandingPage = useCallback(() => {
    const state = (window.history.state || {}) as AppHistoryState;
    if (state.app !== HISTORY_MARKER || state.view !== 'landing') {
      window.history.pushState({ app: HISTORY_MARKER, view: 'landing' }, '', '#landing');
    }
    setViewLandingPage(true);
    setIsSidebarOpen(false);
  }, []);

  const enterWorkspace = useCallback(() => {
    const next = user ? resolveTab(user.role, currentTab) : currentTab;
    const state = (window.history.state || {}) as AppHistoryState;
    if (state.app !== HISTORY_MARKER || state.view !== 'workspace' || state.tab !== next) {
      window.history.pushState({ app: HISTORY_MARKER, view: 'workspace', tab: next }, '', `#${next}`);
    }
    setViewLandingPage(false);
  }, [currentTab, user]);

  // Establish safe in-app history when a session starts and restore the last role-allowed tab.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      historyUserId.current = null;
      const state = (window.history.state || {}) as AppHistoryState;
      if (state.app !== HISTORY_MARKER || state.view !== 'landing') {
        window.history.replaceState({ app: HISTORY_MARKER, view: 'landing' }, '', '#landing');
      }
      return;
    }
    if (historyUserId.current === user.id) return;
    historyUserId.current = user.id;

    let saved = '';
    try {
      const raw = sessionStorage.getItem(TAB_STORAGE_KEY) || '';
      if (raw.startsWith(`${user.id}:`)) saved = raw.slice(user.id.length + 1);
    } catch {
      /* storage unavailable */
    }
    const state = (window.history.state || {}) as AppHistoryState;
    if (state.app === HISTORY_MARKER && state.view === 'landing') {
      setViewLandingPage(true);
      return;
    }

    const requested = state.view === 'workspace'
      ? state.tab
      : window.location.hash.replace(/^#/, '');
    const next = resolveTab(user.role, requested || saved || 'dashboard');

    if (state.app !== HISTORY_MARKER) {
      window.history.replaceState({ app: HISTORY_MARKER, view: 'landing' }, '', '#landing');
      window.history.pushState({ app: HISTORY_MARKER, view: 'workspace', tab: next }, '', `#${next}`);
    } else {
      window.history.replaceState({ app: HISTORY_MARKER, view: 'workspace', tab: next }, '', `#${next}`);
    }
    setViewLandingPage(false);
    applyTab(next);
  }, [loading, user?.id, user?.role, applyTab]);

  // Browser Back/Forward now moves between landing page and prior workspace tabs without ending the session.
  useEffect(() => {
    if (!user) return;
    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as AppHistoryState;
      setIsSidebarOpen(false);
      if (state.app === HISTORY_MARKER && state.view === 'landing') {
        setViewLandingPage(true);
        return;
      }

      const requested = state.view === 'workspace'
        ? state.tab
        : window.location.hash.replace(/^#/, '');
      setViewLandingPage(false);
      applyTab(requested || 'dashboard');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, applyTab]);

  const modals = (
    <>
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToRegister={() => {
          setIsLoginOpen(false);
          setIsRegisterOpen(true);
        }}
        onOpenForgotPassword={() => {
          setIsLoginOpen(false);
          setIsForgotOpen(true);
        }}
      />
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSwitchToLogin={() => {
          setIsRegisterOpen(false);
          setIsLoginOpen(true);
        }}
      />
      <PasswordResetModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        onSuccess={() => {
          setIsForgotOpen(false);
          setIsLoginOpen(true);
        }}
        onBackToLogin={() => {
          setIsForgotOpen(false);
          setIsLoginOpen(true);
        }}
      />
    </>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 text-xs text-neutral-400 font-mono animate-pulse">
        Loading Barangay Bang-Bang system…
      </div>
    );
  }

  // Visitors (and signed-in users who opened the public page) see the landing page.
  if (!user || viewLandingPage) {
    return (
      <>
        <LandingPage
          onEnterApp={enterWorkspace}
          onOpenForgotPassword={() => setIsForgotOpen(true)}
        />
        {modals}
      </>
    );
  }

  const renderContent = () => {
    switch (user.role) {
      case 'admin':
        switch (currentTab) {
          case 'schedules':
            return <SchedulesManager />;
          case 'monitoring':
            return <MonitoringView />;
          case 'map':
            return <MapView />;
          case 'households':
            return <HouseholdsManager />;
          case 'residents':
            return <UsersManager key="residents" mode="residents" />;
          case 'staff':
            return <UsersManager key="staff" mode="staff" />;
          case 'payments':
            return <PaymentVerificationView />;
          case 'endorsements':
            return <EndorsementProcessingView />;
          case 'reports':
            return <ReportsView />;
          case 'announcements':
            return <AnnouncementsManager />;
          case 'notifications':
            return <NotificationsView onNavigate={navigate} />;
          case 'activity-logs':
            return <ActivityLogsView />;
          case 'settings':
            return <SystemSettingsView />;
          case 'profile':
            return <ProfileView />;
          default:
            return <AdminDashboard onNavigate={navigate} />;
        }

      case 'collector':
        switch (currentTab) {
          case 'assigned-tasks':
            return <CollectorTasks onNavigate={navigate} />;
          case 'scanner':
            return <ScannerView />;
          case 'map':
            return <MapView />;
          case 'collection-history':
            return <CollectionHistoryView />;
          case 'schedules':
            return <SchedulesManager />;
          case 'announcements':
            return <AnnouncementsManager />;
          case 'notifications':
            return <NotificationsView onNavigate={navigate} />;
          case 'profile':
            return <ProfileView />;
          default:
            return <CollectorDashboard onNavigate={navigate} />;
        }

      case 'leader':
        switch (currentTab) {
          case 'registrations':
            return <RegistrationsView />;
          case 'purok-households':
            return <HouseholdsManager />;
          case 'map':
            return <MapView />;
          case 'scanner':
            return <ScannerView />;
          case 'disposal-verification':
            return <DisposalVerificationView />;
          case 'payment-verification':
            return <PaymentVerificationView />;
          case 'endorsement-processing':
            return <EndorsementProcessingView />;
          case 'schedules':
            return <SchedulesManager />;
          case 'announcements':
            return <AnnouncementsManager />;
          case 'notifications':
            return <NotificationsView onNavigate={navigate} />;
          case 'profile':
            return <ProfileView />;
          default:
            return <LeaderDashboard onNavigate={navigate} />;
        }

      case 'resident':
        switch (currentTab) {
          case 'schedules':
            return <SchedulesManager />;
          case 'my-disposal':
            return <ResidentDisposalView />;
          case 'contributions':
            return <ResidentPaymentsView />;
          case 'my-qr':
            return <MyHouseholdQrView />;
          case 'map':
            return <MapView />;
          case 'endorsements':
            return <ResidentEndorsementsView />;
          case 'announcements':
            return <AnnouncementsManager />;
          case 'notifications':
            return <NotificationsView onNavigate={navigate} />;
          case 'profile':
            return <ProfileView />;
          default:
            return <ResidentDashboard onNavigate={navigate} />;
        }
    }
  };

  return (
    <div className="h-dvh bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-['Public_Sans',sans-serif] transition-colors">
      <Header
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenRegister={() => setIsRegisterOpen(true)}
        onViewLandingPage={showLandingPage}
        onNavigate={navigate}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={navigate}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {/* key resets page state when switching tabs */}
            <React.Suspense fallback={<div className="py-20 text-center text-xs text-neutral-400 animate-pulse">Loading…</div>}>
              <React.Fragment key={currentTab}>{renderContent()}</React.Fragment>
            </React.Suspense>
          </div>
        </main>
      </div>

      {user.role === 'collector' && <CollectorGpsTracker />}
      {modals}
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <MainLayout />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
