
import { useEffect, useMemo, useState } from 'react';
import { AutomatorPage } from './components/AutomatorPage';
import { ContentPage } from './components/ContentPage';
import { DashboardPage } from './components/DashboardPage';
import { LogsPage } from './components/LogsPage';
import { SessionsPage } from './components/SessionsPage';
import { SettingsPage } from './components/SettingsPage';
import { TelegramPage } from './components/TelegramPage';
import { WatermarkPage } from './components/WatermarkPage';
import { MergePage } from './components/MergePage';
import { GalleryPage } from './components/GalleryPage';
import { InstructionsPage } from './components/InstructionsPage';
import { IntegrationsPage } from './components/IntegrationsPage';
import { Layout } from './components/Layout';
import { DownloaderPage } from './components/DownloaderPage';
import { WelcomePage } from './components/WelcomePage';
import { ErrorBoundary, PageBoundary } from './components/ErrorBoundary';
import { useAppStore, AppPage } from './store';

const pageTitles: Record<AppPage, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: 'Operational overview and quick stats.' },
  sessions: { title: 'Sessions', description: 'Manage per-profile workspaces and run flows.' },
  automator: { title: 'Automator', description: 'Run prompt generation and download pipelines.' },
  downloader: { title: 'Downloader', description: 'Scan drafts and download videos with titles.' },
  content: { title: 'Content Editor', description: 'Edit prompts, image prompts, and titles in one place.' },
  watermark: { title: 'Watermark Check', description: 'Generate preview frames to inspect outputs.' },
  merge: { title: 'Video Merge', description: 'Combine multiple video clips into one.' },
  gallery: { title: 'Gallery', description: 'Browse and preview generated videos.' },
  logs: { title: 'Logs', description: 'Review automation logs and events.' },
  settings: { title: 'Settings', description: 'Paths, executables, timings, and limits.' },
  integrations: { title: 'Integrations', description: 'Manage sites and selectors for universal automation.' },
  telegram: { title: 'Telegram', description: 'Configure bot tokens and notifications.' },
  instructions: { title: 'Instructions', description: 'Documentation and User Guide.' },
};

function PageView({ currentPage }: { currentPage: AppPage }) {
  switch (currentPage) {
    case 'dashboard': return <PageBoundary title="Dashboard"><DashboardPage /></PageBoundary>;
    case 'sessions': return <PageBoundary title="Sessions"><SessionsPage /></PageBoundary>;
    case 'content': return <PageBoundary title="Content Editor"><ContentPage /></PageBoundary>;
    case 'automator': return <PageBoundary title="Automator"><AutomatorPage /></PageBoundary>;
    case 'downloader': return <PageBoundary title="Downloader"><DownloaderPage /></PageBoundary>;
    case 'watermark': return <PageBoundary title="Watermark"><WatermarkPage /></PageBoundary>;
    case 'merge': return <PageBoundary title="Merge"><MergePage /></PageBoundary>;
    case 'gallery': return <PageBoundary title="Gallery"><GalleryPage /></PageBoundary>;
    case 'telegram': return <PageBoundary title="Telegram"><TelegramPage /></PageBoundary>;
    case 'settings': return <PageBoundary title="Settings"><SettingsPage /></PageBoundary>;
    case 'integrations': return <PageBoundary title="Integrations"><IntegrationsPage /></PageBoundary>;
    case 'logs': return <PageBoundary title="Logs"><LogsPage /></PageBoundary>;
    case 'instructions': return <PageBoundary title="Instructions"><InstructionsPage /></PageBoundary>;
    default: return null;
  }
}

function App() {
  const { 
    hasStarted, 
    currentPage, 
    setCurrentPage, 
    setSessions, 
    setConfig, 
    setSelectedSessionName, 
    quickAccessOpen, 
    toggleQuickAccess, 
    setWorkflowStatus, 
    updateNodeStatus,
    incrementStat 
  } = useAppStore();

  const { title, description } = pageTitles[currentPage];
  const [loading, setLoading] = useState(true);

  const api = useMemo(() => window.electronAPI ?? null, []);

  useEffect(() => {
      if (!api) return;
      const unsubscribe = api.pipeline?.onProgress?.((event: any) => {
          if (event.stepId === 'workflow') {
              setWorkflowStatus(event.status);
          } else {
              updateNodeStatus(event.stepId, event.status, event.message);
              
              // Simple heuristic to increment stats from generic pipeline events
              // Real logic is better handled if the backend sends specific event types
              if (event.status === 'success') {
                  if (event.label && event.label.toLowerCase().includes('download')) {
                      incrementStat('downloadsCompleted');
                  }
                  if (event.label && event.label.toLowerCase().includes('prompt')) {
                      incrementStat('promptsSubmitted');
                  }
              }
              if (event.status === 'error') {
                  incrementStat('errors');
              }
          }
      });
      return () => { if (unsubscribe) unsubscribe(); };
  }, [api, setWorkflowStatus, updateNodeStatus, incrementStat]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!api) {
        setLoading(false);
        return;
      }

      try {
        const fetchConfig = api.config?.get;
        const config = fetchConfig ? await fetchConfig() : null;
        if (mounted && config) setConfig(config as any);

        const fetchSessions = api.sessions?.list;
        const sessions = fetchSessions ? await fetchSessions() : [];
        if (mounted && Array.isArray(sessions)) {
          setSessions(sessions ?? []);
          setSelectedSessionName((sessions?.[0]?.name as string) ?? null);
        }
      } catch (err) {
        console.error('Initial load failed', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [api, setConfig, setSessions, setSelectedSessionName]);

  if (!hasStarted) {
    return <WelcomePage />;
  }

  return (
    <ErrorBoundary title="App crashed" description="The UI crashed but the shell is still running.">
      <Layout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        pageTitle={title}
        pageDescription={description}
        quickAccessOpen={quickAccessOpen}
        onToggleQuickAccess={toggleQuickAccess}
      >
        <PageView currentPage={currentPage} />
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
