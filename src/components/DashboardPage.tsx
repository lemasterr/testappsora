
import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { StatCard } from './StatCard';
import { Icons } from './Icons';

type DailyStats = { date: string; submitted: number; failed: number; downloaded: number };
type TopSession = { sessionId: string; downloaded: number };

// Simple SVG Bar Chart Component
const SimpleBarChart = ({ data }: { data: DailyStats[] }) => {
  if (data.length === 0) return <div className="flex h-48 items-center justify-center text-xs text-zinc-600 font-mono uppercase tracking-widest">No activity recorded</div>;

  const maxVal = Math.max(...data.map(d => Math.max(d.submitted, d.downloaded, d.failed, 1)));
  const height = 160;

  return (
    <div className="relative h-52 w-full overflow-x-auto pt-8 scrollbar-thin">
      <div className="flex items-end h-[160px] gap-6 px-4 min-w-max">
        {data.map((day, i) => {
          const hSub = (day.submitted / maxVal) * height;
          const hDown = (day.downloaded / maxVal) * height;
          const hFail = (day.failed / maxVal) * height;

          return (
            <div key={i} className="group flex flex-col items-center gap-2 relative cursor-default">
              <div className="flex items-end gap-1.5 h-full">
                {/* Downloaded (Emerald) */}
                <div className="w-2 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm group-hover:to-emerald-300 transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.2)] group-hover:shadow-[0_0_15px_rgba(52,211,153,0.5)]" style={{ height: Math.max(4, hDown) }} />
                {/* Submitted (Indigo) */}
                <div className="w-2 bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-sm group-hover:to-indigo-300 transition-all duration-300" style={{ height: Math.max(4, hSub) }} />
                {/* Failed (Rose) */}
                <div className="w-2 bg-gradient-to-t from-rose-600 to-rose-400 rounded-t-sm group-hover:to-rose-300 transition-all duration-300" style={{ height: Math.max(4, hFail) }} />
              </div>
              <div className="text-[10px] text-zinc-600 font-mono group-hover:text-zinc-300 transition-colors">{day.date.slice(5)}</div>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-3 rounded-xl shadow-2xl min-w-[140px] pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-2 pb-2 border-b border-zinc-800">{day.date}</div>
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px]"><span className="text-emerald-400">Downloaded</span> <span className="font-mono text-white">{day.downloaded}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-indigo-400">Prompts</span> <span className="font-mono text-white">{day.submitted}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-rose-400">Errors</span> <span className="font-mono text-white">{day.failed}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HealthIndicator = ({ label, status, message }: { label: string, status: 'ok'|'err'|'loading', message?: string }) => (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
        <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${status === 'ok' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : status === 'loading' ? 'bg-zinc-500 animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'}`} />
            <span className="text-xs font-medium text-zinc-300">{label}</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{message || (status === 'ok' ? 'Online' : status === 'loading' ? 'Checking...' : 'Offline')}</span>
    </div>
);

export const DashboardPage: React.FC = () => {
  const { sessions } = useAppStore();
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [topSessions, setTopSessions] = useState<TopSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ chrome: boolean; python: boolean; storage: boolean } | null>(null);

  const totals = useMemo(() => {
    const prompts = sessions.reduce((sum, s) => sum + (s.promptCount ?? 0), 0);
    const titles = sessions.reduce((sum, s) => sum + (s.titleCount ?? 0), 0);
    const pipelineRuns = dailyStats.reduce(
      (sum, day) => sum + (day.submitted > 0 || day.downloaded > 0 || day.failed > 0 ? 1 : 0),
      0
    );
    return { prompts, titles, pipelineRuns };
  }, [dailyStats, sessions]);

  useEffect(() => {
    const load = async () => {
      const api = (window as any).electronAPI;
      if (!api) return;
      try {
        setLoading(true);
        // Health Check
        const healthRes = await api.health.check();
        setHealth(healthRes);

        // Stats
        if (api.analytics) {
            const statsRes = await api.analytics.getDailyStats?.(14);
            if (Array.isArray(statsRes)) setDailyStats(statsRes);
            const topRes = await api.analytics.getTopSessions?.(5);
            if (Array.isArray(topRes)) setTopSessions(topRes);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950/60 via-black to-zinc-950 border border-white/10 p-10 flex items-center justify-between shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none mix-blend-overlay"></div>
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-4 mb-4">
             <div className="p-3 bg-white/5 rounded-2xl backdrop-blur-md border border-white/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                <Icons.SoraLogo className="w-10 h-10 text-indigo-400" />
             </div>
             <div>
                 <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500 tracking-tight">
                    Sora Suite
                 </h1>
                 <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Universal Automation</span>
             </div>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-lg font-light">
            Orchestrate complex workflows across multiple browser sessions. Generate, download, and process content with precision.
          </p>
        </div>
        {/* Decorative element */}
        <div className="hidden lg:block relative z-10 opacity-30 animate-pulse-slow">
            <Icons.Automator className="w-48 h-48 text-indigo-500" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Sessions"
          value={sessions.length}
          icon={<Icons.Sessions className="w-5 h-5 text-white" />}
          hint="Active Profiles"
        />
        <StatCard
          label="Queued Prompts"
          value={totals.prompts}
          icon={<Icons.Content className="w-5 h-5 text-blue-400" />}
          hint="Pending Generation"
        />
        <StatCard
          label="Titles Ready"
          value={totals.titles}
          icon={<Icons.Automator className="w-5 h-5 text-purple-400" />}
          hint="For Downloads"
        />
        <StatCard
          label="Operational Days"
          value={totals.pipelineRuns}
          icon={<Icons.Dashboard className="w-5 h-5 text-emerald-400" />}
          hint="Activity Log"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Chart */}
        <div className="card p-6 lg:col-span-2 bg-gradient-to-b from-[#0e0e11] to-black border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Icons.Graph className="w-4 h-4 text-zinc-500" /> Throughput
              </h3>
              <p className="text-[10px] text-zinc-500 mt-1">Daily metrics for all pipelines</p>
            </div>
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> Download</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div> Prompt</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div> Error</div>
            </div>
          </div>
          <SimpleBarChart data={dailyStats} />
        </div>

        {/* System Status */}
        <div className="flex flex-col gap-6">
            <div className="card p-6 bg-zinc-900/40 border-white/5 backdrop-blur-xl">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Icons.Settings className="w-4 h-4 text-zinc-500"/> System Health
                </h3>
                <div className="space-y-3">
                    <HealthIndicator label="Chrome Engine" status={health ? (health.chrome ? 'ok' : 'err') : 'loading'} />
                    <HealthIndicator label="Python Core" status={health ? (health.python ? 'ok' : 'err') : 'loading'} />
                    <HealthIndicator label="File System" status={health ? (health.storage ? 'ok' : 'err') : 'loading'} />
                </div>
            </div>

            <div className="card p-6 bg-zinc-900/40 border-white/5 backdrop-blur-xl flex-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Icons.Star className="w-4 h-4 text-amber-400"/> Top Sessions
                </h3>
                <div className="space-y-4">
                    {topSessions.length === 0 && (
                    <div className="text-[10px] text-zinc-600 font-mono text-center py-4 uppercase tracking-widest">No data available</div>
                    )}
                    {topSessions.map((item, idx) => {
                    const sessionName = sessions.find((s) => s.id === item.sessionId)?.name || item.sessionId;
                    const maxVal = topSessions[0]?.downloaded || 1;
                    const percent = (item.downloaded / maxVal) * 100;

                    return (
                        <div key={item.sessionId} className="group relative">
                        <div className="flex items-center justify-between text-xs mb-1.5 relative z-10">
                            <span className="font-bold text-zinc-400 flex items-center gap-3">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-[9px] font-mono text-zinc-500 border border-white/5">{idx + 1}</span>
                            {sessionName}
                            </span>
                            <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{item.downloaded}</span>
                        </div>
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div
                            className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${percent}%` }}
                            />
                        </div>
                        </div>
                    );
                    })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
