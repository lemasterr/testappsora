
import { useEffect, useRef, useState } from 'react';
import type { ManagedSession, SessionLogEntry } from '../../shared/types';
import { Icons } from './Icons';

interface SessionWindowProps {
  session: ManagedSession;
  onClose: () => void;
}

export function SessionWindow({ session, onClose }: SessionWindowProps) {
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([]);
    const unsubscribe = window.electronAPI.sessions.subscribeLogs(session.id, (entry: any) => {
      setLogs(prev => {
          const next = [...prev, entry];
          return next.length > 1000 ? next.slice(-1000) : next;
      });
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [session.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const run = async (cmd: string) => {
    setIsRunning(true);
    try {
        setLogs(prev => [...prev, { timestamp: Date.now(), scope: 'UI', level: 'info', message: `> EXEC: ${cmd}` }]);
        
        let res;
        if (cmd === 'stop') {
            res = await window.electronAPI.sessions.command(session.id, 'stop');
        } else {
            res = await window.electronAPI.sessions.command(session.id, cmd as any);
        }

        if (res && !res.ok) {
             setLogs(prev => [...prev, { timestamp: Date.now(), scope: 'UI', level: 'error', message: `Error: ${res.error || 'Command failed'}` }]);
        }
    } catch (e) {
        setLogs(prev => [...prev, { timestamp: Date.now(), scope: 'UI', level: 'error', message: `Exception: ${(e as Error).message}` }]);
    } finally {
        setTimeout(() => setIsRunning(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-8 animate-fade-in">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0c0c0e] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 relative">
        
        {/* CRT Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none z-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-20"></div>

        {/* Header */}
        <div className="h-14 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between px-6 shrink-0 relative z-30">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] transition-colors duration-500 ${isRunning ? 'text-emerald-500 bg-emerald-500' : 'text-zinc-600 bg-zinc-600'}`} />
            <div>
              <div className="font-bold text-sm text-zinc-200 flex items-center gap-2 font-mono">
                  SESSION_MONITOR <span className="text-zinc-600">::</span> <span className="text-indigo-400">{session.name.toUpperCase()}</span>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider flex gap-2">
                  <span>ID: {session.id.slice(0, 8)}</span>
                  <span>PORT: {session.cdpPort}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Console Area */}
        <div className="flex-1 bg-[#050505] p-6 overflow-y-auto font-mono text-xs scrollbar-thin relative z-10">
          {logs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-800 select-none">
              <Icons.Logs className="w-16 h-16 mb-4 opacity-20" />
              <p className="tracking-widest uppercase text-[10px]">Awaiting Signal...</p>
            </div>
          )}
          <div className="space-y-1">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-3 group hover:bg-white/5 p-0.5 rounded items-start transition-colors">
                <span className="text-zinc-700 shrink-0 select-none w-[70px]">{new Date(l.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                <span className={`shrink-0 w-24 font-bold uppercase tracking-wider text-[10px] py-0.5 ${
                    l.level === 'error' ? 'text-rose-500' : 
                    l.level === 'warn' ? 'text-amber-500' : 
                    l.scope === 'Chrome' ? 'text-blue-400' :
                    l.scope === 'Prompts' ? 'text-purple-400' :
                    l.scope === 'Download' ? 'text-emerald-400' :
                    'text-zinc-500'
                }`}>{l.scope}</span>
                <span className={`${l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'} break-all whitespace-pre-wrap leading-relaxed`}>{l.message}</span>
              </div>
            ))}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Footer / Controls */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/90 flex gap-3 shrink-0 relative z-30">
          <div className="flex bg-black/40 rounded-lg p-1 border border-zinc-800 backdrop-blur">
            <button onClick={() => run('startChrome')} disabled={isRunning} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-all flex items-center gap-2 disabled:opacity-50">
              <Icons.Sessions className="w-3 h-3 text-blue-500" /> Launch
            </button>
            <div className="w-px bg-zinc-800 mx-1 my-1" />
            <button onClick={() => run('runPrompts')} disabled={isRunning} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-all flex items-center gap-2 disabled:opacity-50">
              <Icons.Play className="w-3 h-3 text-emerald-500" /> Prompts
            </button>
            <button onClick={() => run('runDownloads')} disabled={isRunning} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-all flex items-center gap-2 disabled:opacity-50">
              <Icons.Downloader className="w-3 h-3 text-purple-500" /> DL
            </button>
          </div>
          <div className="flex-1" />
          <button onClick={() => run('stop')} className="px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all flex items-center gap-2">
            <Icons.Stop className="w-3 h-3" /> Stop
          </button>
        </div>

      </div>
    </div>
  );
}
