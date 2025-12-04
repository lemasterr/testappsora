
import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store';
import type { Config, ChromeProfile } from '../../shared/types';
import { Icons } from './Icons';

export const SettingsPage: React.FC = () => {
  const { config, refreshConfig, setCurrentPage } = useAppStore();
  const [form, setForm] = useState<Config | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'paths' | 'profiles' | 'advanced'>('general');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [cloneStatus, setCloneStatus] = useState<string>('');
  const [scannedProfiles, setScannedProfiles] = useState<ChromeProfile[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (config && !form) setForm(config); else if (!config) refreshConfig(); }, [config, refreshConfig]);

  const loadProfiles = async () => {
    const res = await window.electronAPI.chrome.listProfiles();
    if (Array.isArray(res)) setScannedProfiles(res);
    else if (res?.profiles) setScannedProfiles(res.profiles);
  };

  useEffect(() => { loadProfiles(); }, []);

  // Auto-Save Logic
  useEffect(() => {
      if (!form) return;
      if (JSON.stringify(form) === JSON.stringify(config)) return;

      setSaveStatus('saving');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
          await window.electronAPI.config.update(form);
          await refreshConfig();
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
      }, 1000);

      return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [form, config, refreshConfig]);

  const cloneProfile = async () => {
    setCloneStatus('Cloning...');
    try {
        const res = await window.electronAPI.chrome.cloneProfile();
        setCloneStatus(res.ok ? 'Done! Restart app recommended.' : `Error: ${res.error}`);
    } catch (e) { setCloneStatus('Failed'); }
  };

  const handleResetApp = () => {
      if (confirm("Reset application UI state? This will clear local preferences but keep your data files.")) {
          localStorage.clear();
          window.location.reload();
      }
  };

  if (!form) return <div className="p-10 text-center text-zinc-500 animate-pulse">Loading configuration...</div>;

  return (
    <div className="max-w-5xl mx-auto pb-10 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end p-8 rounded-3xl bg-gradient-to-br from-indigo-900/20 via-black to-black border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Settings</h1>
            <p className="text-sm text-zinc-400">System configuration & presets</p>
        </div>
        <div className="relative z-10 flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
             {saveStatus === 'saving' && <span className="text-xs text-blue-400 font-mono animate-pulse flex items-center"><Icons.Refresh className="w-3 h-3 mr-2 animate-spin"/> Saving...</span>}
             {saveStatus === 'saved' && <span className="text-xs text-emerald-400 font-mono flex items-center"><Icons.Check className="w-3 h-3 mr-2"/> Saved</span>}
             {saveStatus === 'idle' && <span className="text-xs text-zinc-600 font-mono">Up to date</span>}
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5 overflow-x-auto">
        {['general', 'paths', 'profiles', 'advanced'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition-all ${activeTab === t ? 'border-indigo-500 text-white bg-white/5' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>
                {t}
            </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
            <div className="card p-6 space-y-5">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Icons.Automator className="w-4 h-4 text-blue-400"/> Automation</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs text-zinc-400 font-bold uppercase">Prompt Delay</label><input type="number" className="input-field mt-1" value={form.promptDelayMs} onChange={e => setForm({...form, promptDelayMs: +e.target.value})}/></div>
                    <div><label className="text-xs text-zinc-400 font-bold uppercase">DL Timeout</label><input type="number" className="input-field mt-1" value={form.downloadTimeoutMs} onChange={e => setForm({...form, downloadTimeoutMs: +e.target.value})}/></div>
                </div>
                <div><label className="text-xs text-zinc-400 font-bold uppercase">Max Parallel Sessions</label><input type="number" className="input-field mt-1" value={form.maxParallelSessions} onChange={e => setForm({...form, maxParallelSessions: +e.target.value})}/></div>
                
                <div className="pt-4 border-t border-white/5">
                    <label className="text-xs text-zinc-400 font-bold uppercase">Global Merge Batch</label>
                    <input type="number" className="input-field mt-1" value={form.mergeBatchSize ?? 0} onChange={e => setForm({...form, mergeBatchSize: +e.target.value})}/>
                    <p className="text-[10px] text-zinc-600 mt-1">0 = Merge all into one. {'>'} 0 = Split.</p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="card p-6 space-y-5 bg-gradient-to-br from-zinc-900 to-[#0e0e11] border-l-4 border-l-violet-500">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Icons.Code className="w-4 h-4 text-violet-400"/> Universal Integration</h3>
                    <p className="text-xs text-zinc-400">Configure selectors for sites other than Sora (e.g. Midjourney, Gemini).</p>
                    <button onClick={() => setCurrentPage('integrations')} className="btn-secondary w-full border-violet-500/30 text-violet-300 hover:bg-violet-500/10 transition-all hover:scale-[1.02]">
                        Open Integrations Manager
                    </button>
                </div>

                <div className="card p-6 space-y-5">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Icons.Trash className="w-4 h-4 text-rose-400"/> Cleanup</h3>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer bg-zinc-900/50 px-3 py-2 rounded border border-white/10"><input type="checkbox" checked={form.cleanup?.enabled} onChange={e => setForm({...form, cleanup: {...form.cleanup, enabled: e.target.checked}})} className="accent-indigo-500"/> Enabled</label>
                        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer bg-zinc-900/50 px-3 py-2 rounded border border-white/10"><input type="checkbox" checked={form.cleanup?.dryRun} onChange={e => setForm({...form, cleanup: {...form.cleanup, dryRun: e.target.checked}})} className="accent-amber-500"/> Dry Run</label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs text-zinc-400 font-bold uppercase">Downloads</label><input type="number" className="input-field mt-1" value={form.cleanup?.retentionDaysDownloads} onChange={e => setForm({...form, cleanup: {...form.cleanup, retentionDaysDownloads: +e.target.value}})}/></div>
                        <div><label className="text-xs text-zinc-400 font-bold uppercase">Blurred</label><input type="number" className="input-field mt-1" value={form.cleanup?.retentionDaysBlurred} onChange={e => setForm({...form, cleanup: {...form.cleanup, retentionDaysBlurred: +e.target.value}})}/></div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Paths Tab */}
      {activeTab === 'paths' && (
        <div className="card p-6 space-y-6">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Icons.Folder className="w-4 h-4 text-amber-400"/> System Paths</h3>

            <div>
                <label className="text-xs text-zinc-400 font-bold uppercase">Sessions Root</label>
                <div className="flex gap-2 mt-1">
                    <input className="input-field font-mono text-xs bg-black/20" value={form.sessionsRoot} readOnly />
                    <button onClick={() => window.electronAPI.system.openPath(form.sessionsRoot)} className="btn-secondary whitespace-nowrap">Reveal</button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="text-xs text-zinc-400 font-bold uppercase">Chrome Executable</label>
                    <input className="input-field mt-1 font-mono text-xs" value={form.chromeExecutablePath || ''} onChange={e => setForm({...form, chromeExecutablePath: e.target.value})} placeholder="Auto-detect"/>
                </div>
                <div>
                    <label className="text-xs text-zinc-400 font-bold uppercase">User Data Dir</label>
                    <input className="input-field mt-1 font-mono text-xs" value={form.chromeUserDataDir || ''} onChange={e => setForm({...form, chromeUserDataDir: e.target.value})} placeholder="System Default"/>
                </div>
            </div>
        </div>
      )}

      {/* Profiles Tab */}
      {activeTab === 'profiles' && (
        <div className="space-y-6">
            <div className="card p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-sm font-bold text-white">Detected Profiles</h3>
                        <p className="text-xs text-zinc-500">Chrome profiles found on your system</p>
                    </div>
                    <button onClick={loadProfiles} className="btn-secondary text-xs"><Icons.Refresh className="w-3 h-3 mr-1"/> Rescan</button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="text-zinc-500 border-b border-white/5 bg-white/5">
                            <tr>
                                <th className="p-3">Name</th>
                                <th className="p-3">Directory</th>
                                <th className="p-3">Full Path</th>
                                <th className="p-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {scannedProfiles.map((p) => (
                                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-3 font-medium text-zinc-200">{p.name}</td>
                                    <td className="p-3 font-mono text-zinc-400">{p.profileDirectory}</td>
                                    <td className="p-3 font-mono text-zinc-600 truncate max-w-xs" title={(p as any).path}>
                                      {(p as any).path || `${(p as any).userDataDir}/${p.profileDirectory}`}
                                    </td>
                                    <td className="p-3 text-right">
                                        {form.chromeActiveProfileName === p.name ? (
                                            <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded">Active</span>
                                        ) : (
                                            <button onClick={() => setForm({...form, chromeActiveProfileName: p.name})} className="text-blue-400 hover:text-blue-300 hover:underline">Select</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-900/10 border border-indigo-500/20 flex justify-between items-center">
                <div>
                    <h4 className="text-sm font-bold text-indigo-200">Profile Cloning</h4>
                    <p className="text-xs text-indigo-300/60">Create an isolated copy of your Chrome profile for safer automation.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{cloneStatus}</span>
                    <button onClick={cloneProfile} className="btn-secondary border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20">Clone Active Profile</button>
                </div>
            </div>
        </div>
      )}

      {/* Advanced Tab */}
      {activeTab === 'advanced' && (
        <div className="card p-6 space-y-5">
            <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Developer</h3>
                <button onClick={handleResetApp} className="text-xs text-rose-500 hover:text-rose-400 hover:underline">Reset App UI State</button>
            </div>
            
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs mb-4">
                Warning: Changing CDP port ranges may cause connection failures if Chrome is already running.
            </div>
            <div className="grid md:grid-cols-3 gap-4">
                <div><label className="text-xs text-zinc-400 font-bold uppercase">Base CDP Port</label><input type="number" className="input-field mt-1" value={form.cdpPort || 9222} onChange={e => setForm({...form, cdpPort: +e.target.value})}/></div>
                <div><label className="text-xs text-zinc-400 font-bold uppercase">Draft Timeout</label><input type="number" className="input-field mt-1" value={form.draftTimeoutMs} onChange={e => setForm({...form, draftTimeoutMs: +e.target.value})}/></div>
                <div><label className="text-xs text-zinc-400 font-bold uppercase">FFmpeg Path</label><input className="input-field mt-1" value={form.ffmpegPath || ''} onChange={e => setForm({...form, ffmpegPath: e.target.value})} placeholder="System PATH"/></div>
            </div>
        </div>
      )}

      {/* About Section */}
      <div className="border-t border-white/5 pt-8 text-center pb-4">
          <div className="inline-flex flex-col items-center gap-2">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                <Icons.SoraLogo className="w-8 h-8 text-indigo-500" />
              </div>
              <div className="text-sm font-bold text-white">Sora Suite V3.0 Pro</div>
              <div className="text-[10px] text-zinc-500 font-mono">
                  Universal Automation • React + Electron + Python
              </div>
              <div className="flex gap-2 mt-2">
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-zinc-400">Build 3001</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">Stable</span>
              </div>
          </div>
      </div>
    </div>
  );
};
