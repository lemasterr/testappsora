
import React, { useEffect, useMemo, useState, useRef } from 'react';
import type { ManagedSession, ChromeProfile, RunResult } from '../../shared/types';
import { SessionWindow } from './SessionWindow';
import { Icons } from './Icons';

const emptySession: ManagedSession = {
  id: '',
  name: 'New Session',
  chromeProfileName: null,
  promptProfile: null,
  cdpPort: 9222,
  promptsFile: '',
  imagePromptsFile: '',
  titlesFile: '',
  submittedLog: '',
  failedLog: '',
  downloadDir: '',
  cleanDir: '',
  cursorFile: '',
  maxVideos: 5,
  openDrafts: false,
  autoLaunchChrome: true,
  autoLaunchAutogen: false,
  notes: '',
  status: 'idle',
  enableAutoPrompts: false,
  promptDelayMs: 0,
  postLastPromptDelayMs: 120000, // 2 Minutes Wait
  maxPromptsPerRun: 2, // 2 Prompts Batch
  autoChainAfterPrompts: false
};

// UI Helpers
const Input = ({ label, value, onChange, type = "text", hint }: any) => (
  <div>
    <div className="flex justify-between mb-1.5">
      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</label>
      {hint && <span className="text-[10px] text-zinc-600 font-medium">{hint}</span>}
    </div>
    <input type={type} className="input-field" value={value} onChange={onChange} />
  </div>
);

const Toggle = ({ label, checked, onChange }: any) => (
  <label className="flex items-center justify-between cursor-pointer py-3 hover:bg-white/5 px-3 -mx-3 rounded-lg transition-colors border border-transparent hover:border-white/5">
    <span className="text-sm font-medium text-zinc-300">{label}</span>
    <div className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
      <input type="checkbox" checked={checked || false} onChange={e => onChange(e.target.checked)} className="sr-only" />
      <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </div>
  </label>
);

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<ManagedSession>(emptySession);
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [openWindowId, setOpenWindowId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = async () => {
    if (!window.electronAPI?.sessions) return;
    const list = await window.electronAPI.sessions.list();
    setSessions(list);
    if (list.length > 0 && !selectedId) {
      handleSelect(list[0]);
    }
  };

  const loadProfiles = async () => {
    const chromeApi = window.electronAPI?.chrome;
    if (!chromeApi) return;
    const result = await chromeApi.listProfiles?.();
    if (Array.isArray(result)) setProfiles(result);
    else if (result?.profiles) setProfiles(result.profiles);
  };

  useEffect(() => {
    loadSessions();
    loadProfiles();
  }, []);

  const handleSelect = (session: ManagedSession) => {
    setSelectedId(session.id);
    setForm(session);
    setMessage('');
  };

  const handleChange = <K extends keyof ManagedSession>(key: K, value: ManagedSession[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Create new session explicitly (manual save)
  const saveSession = async () => {
    setSaving(true);
    const saved = await window.electronAPI.sessions.save(form);
    await loadSessions();
    // Update form with saved version (which might have new ID)
    if (!form.id) {
        handleSelect(saved[saved.length - 1]); // Select newly created
    }
    setSaving(false);
    setMessage('Saved');
    setTimeout(() => setMessage(''), 2000);
  };

  // Auto-Save Logic for Existing Sessions
  useEffect(() => {
      // Only auto-save if session has an ID (already exists)
      if (!form.id) return;
      
      // Check if dirty compared to list state
      const currentInList = sessions.find(s => s.id === form.id);
      if (JSON.stringify(form) === JSON.stringify(currentInList)) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
          setSaving(true);
          await window.electronAPI.sessions.save(form);
          // Silent refresh
          const list = await window.electronAPI.sessions.list();
          setSessions(list);
          setSaving(false);
          setMessage('Auto-saved');
          setTimeout(() => setMessage(''), 2000);
      }, 1000);

      return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [form, sessions]);

  const deleteSession = async () => {
    if (!window.confirm(`Are you sure you want to delete "${form.name}"?`)) return;
    await window.electronAPI.sessions.delete(form.id);
    const list = await window.electronAPI.sessions.list();
    setSessions(list);
    if (list.length > 0) handleSelect(list[0]);
    else {
      setSelectedId('');
      setForm(emptySession);
    }
  };

  const runAction = async (action: 'prompts' | 'downloads' | 'stop' | 'startChrome') => {
    if (!form.id) return;
    setMessage('Sending command...');
    
    let res;
    if (action === 'startChrome') res = await window.electronAPI.sessions.command(form.id, 'startChrome');
    else if (action === 'prompts') res = await window.electronAPI.autogen.run(form.id);
    else if (action === 'downloads') res = await window.electronAPI.downloader.run(form.id, { limit: form.maxVideos });
    else if (action === 'stop') res = await window.electronAPI.sessions.command(form.id, 'stop');

    setMessage(res?.ok ? (res.details || 'Command executed') : (res?.error || 'Command failed'));
  };

  const openSession = useMemo(() => sessions.find(s => s.id === openWindowId), [sessions, openWindowId]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-fade-in">
      {/* Sidebar List */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Your Sessions</span>
          <button 
            onClick={() => { setSelectedId(''); setForm({ ...emptySession, name: 'New Session' }); }}
            className="p-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20"
            title="Create New Session"
          >
            <Icons.Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between group border relative overflow-hidden ${
                selectedId === s.id 
                  ? 'bg-indigo-600/10 border-indigo-500/50 text-white shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                  : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:bg-zinc-800 hover:border-white/10 hover:text-zinc-200'
              }`}
            >
              {selectedId === s.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
              <div className="pl-2">
                <div className="font-semibold">{s.name}</div>
                <div className={`text-[10px] opacity-70 font-mono mt-0.5 ${selectedId === s.id ? 'text-indigo-200' : 'text-zinc-600'}`}>
                  {s.chromeProfileName || 'No profile'}
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full shadow-sm ${
                s.status === 'running' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse' : 
                s.status === 'error' ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]' : 'bg-zinc-700'
              }`} />
            </button>
          ))}
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {/* Toolbar */}
        <div className="h-16 border-b border-white/5 bg-black/20 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <Icons.Sessions className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100 leading-none mb-1">{form.name || 'New Session'}</h2>
              {form.id && <div className="text-[10px] font-mono text-zinc-500">ID: {form.id.slice(0, 8)} • Port: {form.cdpPort}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {form.id && (
              <button onClick={() => setOpenWindowId(form.id)} className="btn-secondary border-white/10 hover:bg-white/10">
                <Icons.Monitor className="w-4 h-4 mr-2" /> Console
              </button>
            )}
            {/* Show "Create" only for new sessions, otherwise show status */}
            {!form.id ? (
                <button onClick={saveSession} disabled={saving} className="btn-primary">
                  {saving ? <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> : <Icons.Check className="w-4 h-4 mr-2" />}
                  {saving ? 'Creating...' : 'Create Session'}
                </button>
            ) : (
                <div className="flex items-center text-xs font-mono bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                    {saving ? <span className="text-blue-400 animate-pulse">Auto-saving...</span> : <span className="text-zinc-500">{message || 'All changes saved'}</span>}
                </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-indigo-500" /> Core Settings
                </h3>
                <div className="space-y-4 bg-zinc-900/40 p-5 rounded-xl border border-white/5 shadow-inner">
                  <Input label="Session Name" value={form.name} onChange={(e: any) => handleChange('name', e.target.value)} />
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">Chrome Profile</label>
                    <select 
                      className="select-field"
                      value={form.chromeProfileName || ''}
                      onChange={(e: any) => handleChange('chromeProfileName', e.target.value)}
                    >
                      <option value="">Select a profile...</option>
                      {profiles.map(p => <option key={p.id} value={p.name}>{p.name} ({p.profileDirectory})</option>)}
                    </select>
                  </div>
                  <Input label="CDP Port" type="number" value={form.cdpPort || ''} onChange={(e: any) => handleChange('cdpPort', +e.target.value)} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-emerald-500" /> Automation Rules
                </h3>
                <div className="bg-zinc-900/40 p-5 rounded-xl border border-white/5 shadow-inner space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Max Videos" type="number" value={form.maxVideos || ''} onChange={(e: any) => handleChange('maxVideos', +e.target.value)} hint="0 = Unlimited" />
                    <Input label="Batch Limit" type="number" value={form.maxPromptsPerRun || ''} onChange={(e: any) => handleChange('maxPromptsPerRun', +e.target.value)} hint="Prompts/run" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Prompt Delay (ms)" type="number" value={form.promptDelayMs || ''} onChange={(e: any) => handleChange('promptDelayMs', +e.target.value)} />
                    <Input label="Post-Run Delay (ms)" type="number" value={form.postLastPromptDelayMs || ''} onChange={(e: any) => handleChange('postLastPromptDelayMs', +e.target.value)} hint="Wait time" />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column */}
            <div className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-500" /> File System
                </h3>
                <div className="space-y-4 bg-zinc-900/40 p-5 rounded-xl border border-white/5 shadow-inner">
                  <Input label="Prompts File" value={form.promptsFile} onChange={(e: any) => handleChange('promptsFile', e.target.value)} />
                  <Input label="Titles File" value={form.titlesFile} onChange={(e: any) => handleChange('titlesFile', e.target.value)} />
                  <Input label="Download Directory" value={form.downloadDir} onChange={(e: any) => handleChange('downloadDir', e.target.value)} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-purple-500" /> Behavior
                </h3>
                <div className="bg-zinc-900/40 p-5 rounded-xl border border-white/5 shadow-inner space-y-2">
                  <Toggle label="Enable Auto-Prompts" checked={form.enableAutoPrompts} onChange={(c: any) => handleChange('enableAutoPrompts', c)} />
                  <Toggle label="Auto-Chain Downloads" checked={form.autoChainAfterPrompts} onChange={(c: any) => handleChange('autoChainAfterPrompts', c)} />
                  <Toggle label="Auto-Launch Chrome" checked={form.autoLaunchChrome} onChange={(c: any) => handleChange('autoLaunchChrome', c)} />
                </div>
              </section>

              <div className="pt-6 border-t border-zinc-800/50">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => runAction('startChrome')} className="btn-secondary w-full">
                    <Icons.Sessions className="w-4 h-4 mr-2 text-blue-400" /> Launch Chrome
                  </button>
                  <button onClick={() => runAction('stop')} className="btn-danger w-full">
                    <Icons.Stop className="w-4 h-4 mr-2" /> Stop All
                  </button>
                  <button onClick={() => runAction('prompts')} className="btn-secondary w-full border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/10">
                    <Icons.Play className="w-4 h-4 mr-2 text-emerald-500" /> Run Prompts
                  </button>
                  <button onClick={() => runAction('downloads')} className="btn-secondary w-full border-blue-500/20 text-blue-300 hover:bg-blue-500/10">
                    <Icons.Downloader className="w-4 h-4 mr-2 text-blue-500" /> Run Downloads
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {form.id && (
            <div className="mt-12 pt-6 border-t border-zinc-800 flex justify-end">
              <button onClick={deleteSession} className="text-xs text-rose-500 hover:text-rose-400 hover:underline transition-colors flex items-center gap-2">
                <Icons.Trash className="w-3 h-3" /> Delete this session permanently
              </button>
            </div>
          )}
        </div>
      </div>

      {openSession && <SessionWindow session={openSession} onClose={() => setOpenWindowId(null)} />}
    </div>
  );
};
