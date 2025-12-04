
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Config, ManagedSession } from '../shared/types';
import type { Node, Edge } from '@xyflow/react';

export type AppPage =
  | 'dashboard'
  | 'sessions'
  | 'automator'
  | 'downloader'
  | 'content'
  | 'logs'
  | 'watermark'
  | 'merge'
  | 'gallery'
  | 'telegram'
  | 'settings'
  | 'integrations'
  | 'instructions';

// Define Preset Type
export interface AutomatorPreset {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
}

interface AutomatorState {
  nodes: Node[];
  edges: Edge[];
  presets: AutomatorPreset[];
}

interface RunStats {
  promptsSubmitted: number;
  downloadsCompleted: number;
  errors: number;
  startTime: number | null;
}

interface AppState {
  hasStarted: boolean; // For Landing Page
  currentPage: AppPage;
  sessions: ManagedSession[];
  selectedSessionName: string | null;
  config: Config | null;
  quickAccessOpen: boolean;
  workflowStatus: 'idle' | 'running' | 'error' | 'success';
  runStats: RunStats;

  // Automator Persistence
  automator: AutomatorState;

  setHasStarted: (started: boolean) => void;
  setCurrentPage: (page: AppPage) => void;
  setSessions: (sessions: ManagedSession[]) => void;
  setSelectedSessionName: (name: string | null) => void;
  setConfig: (config: Config | null) => void;
  toggleQuickAccess: () => void;
  openQuickAccess: () => void;
  closeQuickAccess: () => void;
  setWorkflowStatus: (status: 'idle' | 'running' | 'error' | 'success') => void;
  
  // Stats Actions
  resetRunStats: () => void;
  incrementStat: (key: keyof Omit<RunStats, 'startTime'>) => void;

  // Automator Actions
  setAutomatorNodes: (nodes: Node[]) => void;
  setAutomatorEdges: (edges: Edge[]) => void;
  updateNodeStatus: (stepId: string, status: string, message: string) => void;
  saveAutomatorPreset: (name: string, nodes: Node[], edges: Edge[]) => void;
  loadAutomatorPreset: (id: string) => void;
  deleteAutomatorPreset: (id: string) => void;

  loadInitialData: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasStarted: false,
      currentPage: 'dashboard',
      sessions: [],
      selectedSessionName: null,
      config: null,
      quickAccessOpen: false,
      workflowStatus: 'idle',
      runStats: { promptsSubmitted: 0, downloadsCompleted: 0, errors: 0, startTime: null },

      // Default Automator State with Example Preset
      automator: {
        nodes: [],
        edges: [],
        presets: [
            {
                id: 'example-img-to-video',
                name: 'Example: Image Gen -> Video',
                nodes: [
                    { id: 'step_1', type: 'step', position: { x: 0, y: 0 }, data: { label: 'Open All Sessions', type: 'global', idPrefix: 'openSessions' } },
                    { id: 'step_2', type: 'step', position: { x: 0, y: 100 }, data: { label: 'Generic Action (Click)', type: 'generic', action: 'click', value: '', label_custom: 'Generate Images' } },
                    { id: 'step_3', type: 'step', position: { x: 0, y: 200 }, data: { label: 'Sora Prompts', type: 'prompt', promptMode: 'sora' } },
                    { id: 'step_4', type: 'step', position: { x: 0, y: 300 }, data: { label: 'Download & Blur', type: 'download' } }
                ],
                edges: [
                    { id: 'e1-2', source: 'step_1', target: 'step_2' },
                    { id: 'e2-3', source: 'step_2', target: 'step_3' },
                    { id: 'e3-4', source: 'step_3', target: 'step_4' }
                ]
            }
        ]
      },

      setHasStarted: (started) => set({ hasStarted: started }),
      setCurrentPage: (page: AppPage) => set({ currentPage: page }),
      setSessions: (sessions: ManagedSession[]) => set({ sessions }),
      setSelectedSessionName: (name: string | null) => set({ selectedSessionName: name }),
      setConfig: (config: Config | null) => set({ config }),
      toggleQuickAccess: () => set((state) => ({ quickAccessOpen: !state.quickAccessOpen })),
      openQuickAccess: () => set({ quickAccessOpen: true }),
      closeQuickAccess: () => set({ quickAccessOpen: false }),
      setWorkflowStatus: (status) => set({ workflowStatus: status }),

      resetRunStats: () => set({ runStats: { promptsSubmitted: 0, downloadsCompleted: 0, errors: 0, startTime: Date.now() } }),
      incrementStat: (key) => set((state) => ({
          runStats: { ...state.runStats, [key]: state.runStats[key] + 1 }
      })),

      setAutomatorNodes: (nodes) =>
        set((state) => ({ automator: { ...state.automator, nodes } })),
      setAutomatorEdges: (edges) =>
        set((state) => ({ automator: { ...state.automator, edges } })),

      updateNodeStatus: (stepId, status, message) => set((state) => {
          const newNodes = state.automator.nodes.map(node => {
              if (node.id === stepId) {
                  return {
                      ...node,
                      data: { ...node.data, executionStatus: status, executionMessage: message }
                  };
              }
              return node;
          });
          return { automator: { ...state.automator, nodes: newNodes } };
      }),

      saveAutomatorPreset: (name, nodes, edges) => set((state) => {
          const currentPresets = state.automator.presets || [];
          const newPreset: AutomatorPreset = {
              id: crypto.randomUUID(),
              name,
              nodes: nodes, 
              edges: edges  
          };
          return { automator: { ...state.automator, presets: [...currentPresets, newPreset] } };
      }),

      loadAutomatorPreset: (id) => set((state) => {
          const preset = (state.automator.presets || []).find(p => p.id === id);
          if (!preset) return state;
          return { automator: { ...state.automator, nodes: preset.nodes, edges: preset.edges } };
      }),

      deleteAutomatorPreset: (id) => set((state) => ({
          automator: { ...state.automator, presets: (state.automator.presets || []).filter(p => p.id !== id) }
      })),

      loadInitialData: async () => {
        const api = window.electronAPI;
        if (!api) return;

        try {
            const [sessions, config] = await Promise.all([
                api.sessions?.list ? api.sessions.list() : Promise.resolve([]),
                api.config?.get ? api.config.get() : Promise.resolve(null),
            ]);

            set({
                sessions: Array.isArray(sessions) ? sessions : [],
                config: config ?? null,
            });

            const currentSelected = get().selectedSessionName;
            if (!currentSelected && Array.isArray(sessions) && sessions.length > 0) {
                 set({ selectedSessionName: sessions[0].name });
            }
        } catch (e) {
            console.error("Failed to load initial data", e);
        }
      },
      refreshSessions: async () => {
        const api = window.electronAPI;
        if (!api?.sessions?.list) return;
        const sessions = await api.sessions.list();
        set((state) => ({
          sessions,
          selectedSessionName: sessions.find(s => s.name === state.selectedSessionName)
            ? state.selectedSessionName
            : (sessions[0]?.name ?? null)
        }));
      },
      refreshConfig: async () => {
        const api = window.electronAPI;
        if (!api?.config?.get) return;
        const config = await api.config.get();
        set({ config: config ?? null });
      }
    }),
    {
      name: 'sora-app-storage',
      storage: createJSONStorage(() => localStorage),
      version: 5, 
      migrate: (persistedState: any, version: number) => {
          return { 
              ...persistedState, 
              hasStarted: false, // Ensure landing page shows on update/refresh
              runStats: { promptsSubmitted: 0, downloadsCompleted: 0, errors: 0, startTime: null }
          };
      },
      partialize: (state) => ({
        currentPage: state.currentPage,
        selectedSessionName: state.selectedSessionName,
        automator: state.automator
        // NOTE: hasStarted is intentionally NOT persisted so it resets on app relaunch
      }),
    }
  )
);
