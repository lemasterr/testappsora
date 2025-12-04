
export {};

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      config: {
        get: () => Promise<any>;
        update: (partial: any) => Promise<any>;
      };
      chrome: {
        scanProfiles: () => Promise<any>;
        listProfiles: () => Promise<any>;
        setActiveProfile: (name: string) => Promise<any>;
        cloneProfile: () => Promise<any>;
      };
      sessions: {
        list: () => Promise<any[]>;
        get: (id: string) => Promise<any>;
        save: (session: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
        command: (id: string, action: string) => Promise<any>;
        subscribeLogs: (id: string, cb: (entry: any) => void) => () => void;
      };
      files: {
        read: (profile: string) => Promise<any>;
        save: (profile: string, files: any) => Promise<any>;
        openFolder: (profile: string) => Promise<any>;
        choose: (type: 'file' | 'folder') => Promise<string>;
        consolidate: () => Promise<any>;
      };
      autogen: {
        run: (id: string) => Promise<any>;
        stop: (id: string) => Promise<any>;
      };
      downloader: {
        run: (id: string, opts?: any) => Promise<any>;
        stop: (id: string) => Promise<any>;
        openDrafts: (key: string) => Promise<any>;
        scanDrafts: (key: string) => Promise<any>;
        downloadAll: (key: string, opts?: any) => Promise<any>;
      };
      pipeline: {
        run: (steps: any) => Promise<any>;
        cancel: () => Promise<void>;
        skip: () => Promise<void>; // Added skip method
        onProgress: (cb: (s: any) => void) => () => void;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        isWindowMaximized: () => Promise<boolean>;
        close: () => void;
      };
      logs: {
        subscribe: (cb: (entry: any) => void) => () => void;
        export: () => Promise<any>;
        clear: () => Promise<any>;
        getHistory: () => Promise<any>;
      };
      video: {
        blurWithProfile: (i: string, o: string, pid: string) => Promise<any>;
        runBlur: (input: string, zones: any[]) => Promise<any>;
        merge: (inputDir: string, output: string) => Promise<any>;
        blurProfiles: {
          list: () => Promise<any>;
          save: (p: any) => Promise<any>;
          delete: (id: string) => Promise<any>;
        };
      };
      inspector: {
        start: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
        poll: (sessionId: string) => Promise<{ ok: boolean; selector?: string | null }>;
      };
      gallery: {
        scan: () => Promise<any>;
        delete: (path: string) => Promise<{ ok: boolean; error?: string }>;
      };
      cleanup: { run: () => Promise<any> };
      telegram: {
        test: () => Promise<any>;
        sendMessage: (text: string) => Promise<any>;
      };
      analytics: {
        getDailyStats: (d: number) => Promise<any>;
        getTopSessions: (l: number) => Promise<any>;
      };
      system: {
        openPath: (t: string) => Promise<void>;
        openLogs: () => Promise<void>;
        openGlobalMerge: () => Promise<void>;
        openBlurred: () => Promise<void>;
      };
      health: { check: () => Promise<any> };
      on?: (channel: string, listener: (...args: any[]) => void) => void;
    };
  }
}