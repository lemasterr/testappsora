
import { ReactNode, useState } from 'react';
import { useAppStore } from '../store';
import { Icons } from './Icons';

export function QuickAccessPanel() {
  const { quickAccessOpen, closeQuickAccess, config, setCurrentPage } = useAppStore();
  const [status, setStatus] = useState('');

  const action = async (fn: () => Promise<any>) => {
    try {
        await fn();
    } catch (e) {
        console.error(e);
    }
  };

  const consolidate = async () => {
    setStatus('Consolidating...');
    try {
      const res = await window.electronAPI.files.consolidate();
      if (res.ok) {
        setStatus(`Moved ${res.count} files`);
        if (res.path) window.electronAPI.system.openPath(res.path);
      } else {
        setStatus(res.error || 'Failed');
      }
    } catch (e) {
      setStatus('Error');
    }
    setTimeout(() => setStatus(''), 3000);
  };

  const stopAll = async () => {
      if (!confirm("Are you sure? This will halt all active workflows and sessions.")) return;
      await window.electronAPI.pipeline.cancel(); // This triggers global cancel
      setStatus('All processes stopped.');
      setTimeout(() => setStatus(''), 3000);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          quickAccessOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeQuickAccess}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-80 bg-[#0c0c0e]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-out z-50 ${
          quickAccessOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/10 bg-black/20">
          <div className="font-bold text-white flex items-center gap-2">
            <div className="p-1 bg-indigo-500/20 rounded"><Icons.Play className="w-4 h-4 text-indigo-500" /></div>
            <span className="tracking-wide text-sm">QUICK ACTIONS</span>
          </div>
          <button onClick={closeQuickAccess} className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-md">
            <Icons.ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-8">
          {/* Emergency */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest px-1">Emergency</h4>
            <Shortcut label="STOP ALL" icon={<Icons.Stop className="w-5 h-5" />} onClick={stopAll} color="text-rose-500 bg-rose-500/10 border-rose-500/20" />
          </div>

          {/* System */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">System</h4>
            <Shortcut label="Open Logs" icon={<Icons.Logs className="w-5 h-5" />} onClick={() => { setCurrentPage('logs'); closeQuickAccess(); }} color="text-blue-400" />
            <Shortcut label="Sessions Root" icon={<Icons.Folder className="w-5 h-5" />} onClick={() => window.electronAPI.system.openPath(config?.sessionsRoot || '')} color="text-amber-400" />
            <Shortcut label="Open Merged Folder" icon={<Icons.Combine className="w-5 h-5" />} onClick={() => window.electronAPI.system.openGlobalMerge()} color="text-violet-400" />
            <Shortcut label="Open Blurred (Root)" icon={<Icons.Watermark className="w-5 h-5" />} onClick={() => window.electronAPI.system.openBlurred()} color="text-emerald-400" />
          </div>

          {/* Tools */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Tools</h4>
            <Shortcut label="Consolidate Files" icon={<Icons.Combine className="w-5 h-5" />} onClick={consolidate} color="text-purple-400" />
            {status && <div className="text-xs text-emerald-400 px-2 animate-pulse bg-emerald-900/20 py-1 rounded">{status}</div>}
            <Shortcut label="Run Cleanup" icon={<Icons.Trash className="w-5 h-5" />} onClick={() => action(window.electronAPI.cleanup.run)} color="text-rose-400" />
            <Shortcut label="Test Telegram" icon={<Icons.Telegram className="w-5 h-5" />} onClick={() => action(window.electronAPI.telegram.test)} color="text-sky-400" />
          </div>
        </div>
      </div>
    </>
  );
}

function Shortcut({ label, icon, onClick, color }: { label: string, icon: ReactNode, onClick: () => void, color: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all text-left group ${color.includes('bg-') ? color : ''}`}
    >
      <span className={`${color} opacity-80 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-white/5 shadow-inner`}>{icon}</span>
      <span className="text-sm text-zinc-300 group-hover:text-white font-medium transition-colors">{label}</span>
    </button>
  );
}
