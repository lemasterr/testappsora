
import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store';
import type { Integration, UniversalSelector } from '../../shared/types';
import { Icons } from './Icons';
import { HelpTip } from './HelpTip';

export const IntegrationsPage: React.FC = () => {
  const { config, refreshConfig, sessions, refreshSessions } = useAppStore();
  
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectors, setSelectors] = useState<UniversalSelector[]>([]);
  
  const [activeIntegrationId, setActiveIntegrationId] = useState<string>('');
  const [newIntName, setNewIntName] = useState('');
  const [pickerSessionId, setPickerSessionId] = useState<string>('');
  const [isPicking, setIsPicking] = useState(false);
  
  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);
  
  // Load config on mount
  useEffect(() => {
      if (config) {
          setIntegrations(config.integrations || []);
          setSelectors(config.universalSelectors || []);
          if (config.integrations?.length && !activeIntegrationId) {
              setActiveIntegrationId(config.integrations[0].id);
          }
      }
  }, [config]);

  // Refresh sessions on mount so the dropdown is fresh
  useEffect(() => {
      refreshSessions();
  }, []);

  const saveConfig = async (newInts: Integration[], newSels: UniversalSelector[]) => {
      await window.electronAPI.config.update({
          integrations: newInts,
          universalSelectors: newSels
      });
      refreshConfig();
  };

  const addIntegration = () => {
      if (!newIntName) return;
      const newInt: Integration = {
          id: crypto.randomUUID(),
          name: newIntName,
          urlPattern: ''
      };
      const next = [...integrations, newInt];
      setIntegrations(next);
      setActiveIntegrationId(newInt.id);
      setNewIntName('');
      saveConfig(next, selectors);
  };

  const deleteIntegration = (id: string) => {
      if (!confirm('Delete this integration and all its selectors?')) return;
      const nextInts = integrations.filter(i => i.id !== id);
      const nextSels = selectors.filter(s => s.integrationId !== id);
      setIntegrations(nextInts);
      setSelectors(nextSels);
      if (nextInts.length > 0) setActiveIntegrationId(nextInts[0].id);
      else setActiveIntegrationId('');
      saveConfig(nextInts, nextSels);
  };

  const addSelector = () => {
      if (!activeIntegrationId) return;
      const newSel: UniversalSelector = {
          id: crypto.randomUUID(),
          integrationId: activeIntegrationId,
          label: 'New Selector',
          type: 'unknown',
          cssSelector: '',
          status: 'pending'
      };
      const next = [...selectors, newSel];
      setSelectors(next);
      saveConfig(integrations, next);
  };

  const updateSelector = (id: string, changes: Partial<UniversalSelector>) => {
      const next = selectors.map(s => s.id === id ? { ...s, ...changes } : s);
      setSelectors(next);
      saveConfig(integrations, next);
  };

  const deleteSelector = (id: string) => {
      const next = selectors.filter(s => s.id !== id);
      setSelectors(next);
      saveConfig(integrations, next);
  };

  const startPicker = async (selectorId: string) => {
      if (!pickerSessionId) {
          alert("Please select an active session (with Chrome open) to pick from.");
          return;
      }
      
      setIsPicking(true);
      
      const res = await window.electronAPI.inspector.start(pickerSessionId);
      if (!res.ok) {
          alert(`Failed to start inspector: ${res.error}`);
          setIsPicking(false);
          return;
      }

      const interval = setInterval(async () => {
          if (!isMounted.current) { clearInterval(interval); return; }
          const pollRes = await window.electronAPI.inspector.poll(pickerSessionId);
          if (pollRes.selector) {
              clearInterval(interval);
              if (isMounted.current) {
                  setIsPicking(false);
                  updateSelector(selectorId, { cssSelector: pollRes.selector, status: 'valid' });
              }
          }
      }, 500);

      // Timeout after 60s
      setTimeout(() => {
          clearInterval(interval);
          if (isMounted.current && isPicking) setIsPicking(false);
      }, 60000);
  };

  const activeSelectors = selectors.filter(s => s.integrationId === activeIntegrationId);

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-zinc-900 to-black border border-zinc-800 rounded-3xl shadow-xl shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-violet-500/20 rounded-2xl text-violet-400 border border-violet-500/20">
                    <Icons.Code className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Integrations</h2>
                    <p className="text-sm text-zinc-400">Manage site maps and visual selectors for universal automation.</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 uppercase px-2">Picker Session:</span>
                <select 
                    className="bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border-none focus:ring-1 focus:ring-violet-500 w-40"
                    value={pickerSessionId}
                    onChange={e => setPickerSessionId(e.target.value)}
                    onClick={refreshSessions} 
                >
                    <option value="">Select Session...</option>
                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <HelpTip title="Picker Session">
                    Select an active session where Chrome is already running. The "Pick" button will use this browser window to interactively select elements.
                </HelpTip>
            </div>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
            {/* Sidebar List */}
            <div className="w-64 flex flex-col gap-3 shrink-0">
                <div className="flex gap-2">
                    <input 
                        className="input-field py-1.5 text-xs bg-zinc-900"
                        placeholder="New Integration Name"
                        value={newIntName}
                        onChange={e => setNewIntName(e.target.value)}
                    />
                    <button onClick={addIntegration} className="btn-secondary px-3"><Icons.Plus className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                    {integrations.map(int => (
                        <div 
                            key={int.id}
                            onClick={() => setActiveIntegrationId(int.id)}
                            className={`px-4 py-3 rounded-xl border cursor-pointer transition-all ${activeIntegrationId === int.id ? 'bg-violet-900/20 border-violet-500/50 text-white' : 'bg-zinc-900/30 border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
                        >
                            <div className="text-sm font-bold truncate">{int.name}</div>
                            <div className="text-[10px] opacity-60 truncate">{int.urlPattern || 'No URL pattern'}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 bg-[#0c0c0e] rounded-2xl border border-zinc-800 p-6 flex flex-col gap-4 relative overflow-hidden">
                {activeIntegrationId ? (
                    <>
                        <div className="flex justify-between items-center border-b border-zinc-800 pb-4 shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                                    Selectors 
                                    <HelpTip title="Universal Selectors">
                                        Map UI elements (buttons, inputs) to readable names. These selectors are used by the Automator steps to interact with the site.
                                    </HelpTip>
                                </h3>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addSelector} className="btn-primary text-xs"><Icons.Plus className="w-3 h-3 mr-2"/> Add Selector</button>
                                <button onClick={() => deleteIntegration(activeIntegrationId)} className="btn-danger text-xs px-2"><Icons.Trash className="w-4 h-4"/></button>
                            </div>
                        </div>

                        {/* List Header */}
                        <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2">
                            <div className="col-span-3">Label</div>
                            <div className="col-span-2">Type</div>
                            <div className="col-span-5">CSS Selector</div>
                            <div className="col-span-2 text-right">Actions</div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                            {activeSelectors.map(sel => (
                                <div key={sel.id} className="grid grid-cols-12 gap-4 items-center bg-zinc-900/30 border border-zinc-800/50 p-2 rounded-lg hover:border-zinc-700 transition-colors">
                                    <div className="col-span-3">
                                        <input 
                                            className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-transparent focus:border-zinc-600"
                                            value={sel.label}
                                            onChange={e => updateSelector(sel.id, { label: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <select 
                                            className="w-full bg-zinc-950 text-[10px] text-zinc-400 border border-zinc-800 rounded px-1 py-1 focus:outline-none"
                                            value={sel.type}
                                            onChange={e => updateSelector(sel.id, { type: e.target.value as any })}
                                        >
                                            <option value="unknown">Unknown</option>
                                            <option value="button">Button</option>
                                            <option value="input">Input</option>
                                            <option value="image">Image</option>
                                            <option value="text">Text</option>
                                        </select>
                                    </div>
                                    <div className="col-span-5 relative group">
                                        <input 
                                            className="w-full bg-zinc-950 text-[10px] font-mono text-zinc-400 border border-zinc-800 rounded px-2 py-1.5 focus:outline-none focus:border-violet-500/50"
                                            value={sel.cssSelector}
                                            onChange={e => updateSelector(sel.id, { cssSelector: e.target.value })}
                                            placeholder="Click Pick to auto-detect"
                                        />
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1">
                                        <button 
                                            onClick={() => startPicker(sel.id)}
                                            className={`p-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${isPicking ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-violet-600 hover:text-white hover:border-violet-500'}`}
                                            title="Pick from Browser"
                                        >
                                            {isPicking ? 'Picking...' : 'Pick'}
                                        </button>
                                        <button onClick={() => deleteSelector(sel.id)} className="p-1.5 text-zinc-600 hover:text-rose-400">
                                            <Icons.Trash className="w-3.5 h-3.5"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600 flex-col gap-2">
                        <Icons.Code className="w-12 h-12 opacity-20"/>
                        <p>Select or create an integration to manage selectors.</p>
                    </div>
                )}
            </div>
        </div>
        
        {isPicking && (
            <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-md border border-amber-500/30 text-amber-200 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-bounce-in">
                    <div className="w-3 h-3 bg-amber-500 rounded-full animate-ping"/>
                    <div className="text-sm font-medium">
                        Picker Mode Active. Go to the Chrome window and click an element.
                    </div>
                    <button className="pointer-events-auto text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-white" onClick={() => setIsPicking(false)}>Cancel</button>
                </div>
            </div>
        )}
    </div>
  );
};
