
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  Handle,
  MarkerType,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  NodeChange,
  applyNodeChanges,
  EdgeChange,
  applyEdgeChanges
} from '@xyflow/react';
import { useAppStore } from '../store';
import { Icons } from './Icons';
import { WorkflowClientStep, UniversalSelector, Integration } from '../../shared/types';

// --- Custom Node Component ---
const StepNode = ({ data, selected, id }: any) => {
  const isGlobal = data.type === 'global';
  const isGeneric = data.type === 'generic';
  const isPrompt = data.type === 'prompt';
  const isGenericPrompt = isPrompt && data.promptMode === 'generic';
  
  const status = data.executionStatus || 'idle'; 
  const statusMessage = data.executionMessage || '';

  // Validation Check
  let isValid = true;
  if (isGenericPrompt) isValid = !!(data.promptInputSelectorId && data.submitSelectorId);
  if (isGeneric) {
      if ((data.action === 'click' || data.action === 'type' || data.action === 'scroll') && !data.selectorId) isValid = false;
      if (data.action === 'navigate' && !data.value) isValid = false;
      // Wait requires either a selector (wait for element) OR a value (wait for ms)
      if (data.action === 'wait' && !data.selectorId && !data.value) isValid = false;
  }

  let borderColor = 'border-zinc-700';
  let iconBg = 'bg-zinc-800 text-zinc-400';
  let statusColor = 'text-zinc-500';

  if (selected) borderColor = 'border-white';
  else if (!isValid) borderColor = 'border-amber-500/80 dashed'; // Invalid config warning
  else if (data.type === 'open') { borderColor = 'border-cyan-500/50'; iconBg = 'bg-cyan-500/20 text-cyan-400'; }
  else if (isPrompt) { borderColor = 'border-indigo-500/50'; iconBg = 'bg-indigo-500/20 text-indigo-400'; }
  else if (data.type === 'download') { borderColor = 'border-emerald-500/50'; iconBg = 'bg-emerald-500/20 text-emerald-400'; }
  else if (data.type === 'blur') { borderColor = 'border-blue-500/50'; iconBg = 'bg-blue-500/20 text-blue-400'; }
  else if (data.type === 'merge') { borderColor = 'border-purple-500/50'; iconBg = 'bg-purple-500/20 text-purple-400'; }
  else if (data.type === 'clean') { borderColor = 'border-teal-500/50'; iconBg = 'bg-teal-500/20 text-teal-400'; }
  else if (isGlobal) { borderColor = 'border-amber-500/50'; iconBg = 'bg-amber-500/20 text-amber-400'; }
  else if (isGeneric) { borderColor = 'border-slate-500/50'; iconBg = 'bg-slate-500/20 text-slate-400'; }

  if (status === 'running') { borderColor = 'border-blue-500 animate-pulse'; statusColor = 'text-blue-400'; }
  else if (status === 'success') { borderColor = 'border-emerald-500'; statusColor = 'text-emerald-400'; }
  else if (status === 'error') { borderColor = 'border-rose-500'; statusColor = 'text-rose-400'; }
  else if (status === 'skipped') { borderColor = 'border-zinc-800 opacity-50'; }
  else if (status === 'warning') { borderColor = 'border-amber-500'; statusColor = 'text-amber-400'; }

  const updateData = (key: string, value: any) => {
      data.onChange?.(id, { ...data, [key]: value });
  };

  // State for selectors
  const [blurProfiles, setBlurProfiles] = useState<any[]>([]);
  const [universalSelectors, setUniversalSelectors] = useState<UniversalSelector[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
      if (data.type === 'blur') {
          window.electronAPI.video.blurProfiles.list().then((res: any) => { if (Array.isArray(res)) setBlurProfiles(res); });
      }
      // Load universal selectors and integrations
      if (data.type === 'generic' || data.type === 'prompt') {
          window.electronAPI.config.get().then((res: any) => { 
              if (res.universalSelectors) setUniversalSelectors(res.universalSelectors);
              if (res.integrations) setIntegrations(res.integrations);
          });
      }
  }, [data.type]);

  const renderSelectorOptions = (filter?: (s: UniversalSelector) => boolean) => {
      const filtered = filter ? universalSelectors.filter(filter) : universalSelectors;
      // Group by Integration
      const grouped = integrations.map(int => ({
          name: int.name,
          selectors: filtered.filter(s => s.integrationId === int.id).sort((a,b) => a.label.localeCompare(b.label))
      })).filter(g => g.selectors.length > 0);

      // Add selectors with no valid integration to "Other"
      const orphans = filtered.filter(s => !integrations.find(i => i.id === s.integrationId));
      if (orphans.length > 0) grouped.push({ name: 'Other', selectors: orphans });

      return grouped.map(group => (
          <optgroup key={group.name} label={group.name}>
              {group.selectors.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </optgroup>
      ));
  };

  const getPlaceholder = (action: string) => {
      if (action === 'wait') return 'Time (ms) or leave empty if using selector';
      if (action === 'navigate') return 'https://example.com';
      return 'Value to type...';
  };

  return (
    <div className={`px-3 py-2 rounded-xl border-2 min-w-[220px] bg-[#0c0c0e] shadow-xl transition-all ${borderColor} group`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-400 !w-2.5 !h-2.5 !border-2 !border-[#0c0c0e]" />
      
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-1.5 rounded-lg ${iconBg} relative`}>
            {data.type === 'open' && <Icons.Sessions className="w-3 h-3"/>}
            {data.type === 'prompt' && <Icons.Play className="w-3 h-3"/>}
            {data.type === 'download' && <Icons.Downloader className="w-3 h-3"/>}
            {data.type === 'blur' && <Icons.Watermark className="w-3 h-3"/>}
            {data.type === 'merge' && <Icons.Combine className="w-3 h-3"/>}
            {data.type === 'clean' && <Icons.Code className="w-3 h-3"/>}
            {isGlobal && <Icons.Automator className="w-3 h-3"/>}
            {isGeneric && <Icons.Grip className="w-3 h-3"/>}
            
            {status === 'running' && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />}
            {status === 'success' && <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5 border border-[#0c0c0e]"><Icons.Check className="w-2 h-2 text-black" /></div>}
            {status === 'warning' && <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#0c0c0e]"><Icons.Alert className="w-2 h-2 text-black" /></div>}
        </div>
        <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-zinc-200 truncate">{data.label}</div>
            
            {isGeneric && data.action && (
                <div className="text-[9px] text-zinc-500 truncate font-mono mt-0.5">
                    {data.action} {data.value ? `"${data.value}"` : ''}
                </div>
            )}
            
            {data.sessionName && <div className="text-[9px] text-zinc-500 truncate">{data.sessionName}</div>}
        </div>
      </div>

      {(status !== 'idle' || statusMessage) && (
          <div className={`text-[10px] font-mono px-2 py-1 bg-zinc-900/50 rounded mb-2 truncate ${statusColor}`}>
              {statusMessage || status}
          </div>
      )}

      {/* PROMPT Node - Generic Switch */}
      {data.type === 'prompt' && (
          <div className="mt-1 pt-2 border-t border-zinc-800 space-y-2">
              <select 
                  className="select-field text-[10px] py-1 h-6 w-full font-bold"
                  value={data.promptMode || 'sora'}
                  onChange={e => updateData('promptMode', e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
              >
                  <option value="sora">Mode: Sora Native</option>
                  <option value="generic">Mode: Custom (Generic)</option>
              </select>

              {data.promptMode === 'generic' && (
                  <div className="space-y-1">
                      <select 
                          className={`select-field text-[10px] py-1 h-6 w-full ${!data.promptInputSelectorId ? 'border-amber-500/50' : ''}`}
                          value={data.promptInputSelectorId || ''}
                          onChange={e => updateData('promptInputSelectorId', e.target.value)}
                          onMouseDown={e => e.stopPropagation()}
                      >
                          <option value="">Select Prompt Input...</option>
                          {renderSelectorOptions(s => s.type === 'input' || s.type === 'text' || s.type === 'unknown')}
                      </select>
                      <select 
                          className={`select-field text-[10px] py-1 h-6 w-full ${!data.submitSelectorId ? 'border-amber-500/50' : ''}`}
                          value={data.submitSelectorId || ''}
                          onChange={e => updateData('submitSelectorId', e.target.value)}
                          onMouseDown={e => e.stopPropagation()}
                      >
                          <option value="">Select Submit Button...</option>
                          {renderSelectorOptions(s => s.type === 'button' || s.type === 'unknown')}
                      </select>
                  </div>
              )}
          </div>
      )}

      {/* Configuration Inputs */}
      {data.type === 'blur' && (
          <div className="mt-1 pt-2 border-t border-zinc-800">
              <label className="text-[9px] text-zinc-500 uppercase font-bold block mb-1">Blur Preset</label>
              <select className="select-field text-[10px] py-1 h-6" value={data.blurProfileId || ''} onChange={(e) => updateData('blurProfileId', e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
                  <option value="">Default / Global</option>
                  {blurProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
          </div>
      )}

      {data.type === 'merge' && (
          <div className="mt-1 pt-2 border-t border-zinc-800">
              <label className="text-[9px] text-zinc-500 uppercase font-bold block mb-1">Batch Size (0=All)</label>
              <input type="number" className="input-field text-[10px] py-1 h-6" value={data.mergeBatchSize ?? 0} onChange={(e) => updateData('mergeBatchSize', +e.target.value)} onMouseDown={(e) => e.stopPropagation()}/>
          </div>
      )}

      {isGeneric && (
          <div className="mt-1 pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex gap-1">
                  <select className="select-field text-[10px] py-1 h-6 flex-1" value={data.action || 'click'} onChange={e => updateData('action', e.target.value)} onMouseDown={e => e.stopPropagation()}>
                      <option value="click">Click</option>
                      <option value="type">Type</option>
                      <option value="wait">Wait</option>
                      <option value="navigate">Navigate</option>
                      <option value="scroll">Scroll</option>
                  </select>
              </div>
              
              {data.action !== 'navigate' && (
                  <select className="select-field text-[10px] py-1 h-6 w-full" value={data.selectorId || ''} onChange={e => updateData('selectorId', e.target.value)} onMouseDown={e => e.stopPropagation()}>
                      <option value="">{data.action === 'wait' ? 'Wait for Selector (Optional)' : 'Select Target...'}</option>
                      {renderSelectorOptions()}
                  </select>
              )}

              {(data.action === 'type' || data.action === 'navigate' || data.action === 'wait') && (
                  <input 
                    type="text" 
                    className="input-field text-[10px] py-1 h-6 w-full font-mono" 
                    placeholder={getPlaceholder(data.action)}
                    value={data.value || ''} 
                    onChange={e => updateData('value', e.target.value)} 
                    onMouseDown={e => e.stopPropagation()}
                  />
              )}
          </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-zinc-400 !w-2.5 !h-2.5 !border-2 !border-[#0c0c0e]" />
    </div>
  );
};

const nodeTypes = { step: StepNode };

// --- Main Component ---
export const AutomatorPage: React.FC = () => {
  const { 
    sessions, 
    automator, 
    setAutomatorNodes, 
    setAutomatorEdges, 
    saveAutomatorPreset, 
    loadAutomatorPreset, 
    deleteAutomatorPreset, 
    workflowStatus,
    runStats,
    resetRunStats
  } = useAppStore();

  const [status, setStatus] = useState('idle');
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  
  const [nodes, setNodes] = useState<Node[]>(automator?.nodes || []);
  const [edges, setEdges] = useState<Edge[]>(automator?.edges || []);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (automator.nodes.length === nodes.length) {
          const hasStatusChange = automator.nodes.some((an, i) => {
              const ln = nodes[i];
              return an.id === ln.id && (an.data.executionStatus !== ln.data.executionStatus || an.data.executionMessage !== ln.data.executionMessage);
          });
          if (hasStatusChange) setNodes(automator.nodes);
      } else if (nodes.length === 0 && automator.nodes.length > 0) {
          setNodes(automator.nodes);
          setEdges(automator.edges);
      }
  }, [automator.nodes, automator.edges]); // eslint-disable-line

  useEffect(() => { setStatus(workflowStatus); }, [workflowStatus]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onNodeDragStop = useCallback(() => setAutomatorNodes(nodes), [nodes, setAutomatorNodes]);

  const onNodeDataChange = useCallback((id: string, newData: any) => {
      setNodes((nds) => {
          const next = nds.map((node) => node.id === id ? { ...node, data: newData } : node);
          setAutomatorNodes(next);
          return next;
      });
  }, [setAutomatorNodes]);

  useEffect(() => {
      setNodes((nds) => nds.map(node => ({ ...node, data: { ...node.data, onChange: onNodeDataChange } })));
  }, []); 

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
        const next = addEdge({ ...params, id: `e_${params.source}_${params.target}`, animated: true, type: 'smoothstep', style: { stroke: '#6366f1', strokeWidth: 2 } }, eds);
        setAutomatorEdges(next);
        return next;
    });
  }, [setEdges, setAutomatorEdges]);

  const onDragStart = (event: React.DragEvent, nodeType: string, payload: any) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/payload', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const payloadStr = event.dataTransfer.getData('application/payload');
      if (!payloadStr) return;
      try {
          const payload = JSON.parse(payloadStr);
          const position = { x: event.clientX - (reactFlowWrapper.current?.getBoundingClientRect().left ?? 0), y: event.clientY - (reactFlowWrapper.current?.getBoundingClientRect().top ?? 0) };
          const newNode: Node = {
            id: `${payload.idPrefix}_${Date.now()}`,
            type: 'step',
            position,
            data: { ...payload, onChange: onNodeDataChange, executionStatus: 'idle', executionMessage: '' },
          };
          setNodes((nds) => { const next = (nds || []).concat(newNode); setAutomatorNodes(next); return next; });
      } catch (e) {
          console.error("Failed to drop node", e);
      }
    },
    [setNodes, onNodeDataChange, setAutomatorNodes]
  );

  const run = async () => {
    if (!nodes || nodes.length === 0) return;
    const resetNodes = nodes.map(n => ({ ...n, data: { ...n.data, executionStatus: 'idle', executionMessage: '' } }));
    setNodes(resetNodes);
    setAutomatorNodes(resetNodes);
    resetRunStats();
    setStatus('running');
    
    const steps: WorkflowClientStep[] = resetNodes.map(node => {
        const incoming = edges.filter(e => e.target === node.id).map(e => e.source);
        const d = node.data as any;
        return {
            id: node.id as any,
            label: d.label,
            enabled: true,
            sessionId: d.sessionId,
            dependsOn: incoming.length > 0 ? incoming as any : undefined,
            blurProfileId: d.blurProfileId,
            mergeBatchSize: d.mergeBatchSize,
            type: d.type,
            action: d.action,
            selectorId: d.selectorId,
            value: d.value,
            // Generic Prompt Config
            promptMode: d.promptMode,
            promptInputSelectorId: d.promptInputSelectorId,
            submitSelectorId: d.submitSelectorId
        };
    });
    try { await window.electronAPI.pipeline.run(steps); } catch (e) { console.error(e); }
  };

  const stop = async () => { await window.electronAPI.pipeline.cancel(); };
  const skipStep = async () => { await window.electronAPI.pipeline.skip(); };
  
  const clearGraph = () => {
      if(confirm("Clear entire workflow?")) { setNodes([]); setEdges([]); setAutomatorNodes([]); setAutomatorEdges([]); }
  };

  const deleteSelected = useCallback(() => {
    setNodes((nds) => { const next = nds.filter((n) => !n.selected); setAutomatorNodes(next); return next; });
    setEdges((eds) => { const next = eds.filter((e) => !e.selected); setAutomatorEdges(next); return next; });
  }, [setNodes, setEdges, setAutomatorNodes, setAutomatorEdges]);

  const hasSelection = nodes.some(n => n.selected) || edges.some(e => e.selected);

  const handleSavePreset = () => {
      if (!newPresetName.trim()) return alert("Enter preset name");
      saveAutomatorPreset(newPresetName, nodes, edges);
      setNewPresetName('');
  };

  const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedPresetId(id);
      if (id) {
          loadAutomatorPreset(id);
          const preset = (automator.presets || []).find(p => p.id === id);
          if (preset) { setNodes(preset.nodes); setEdges(preset.edges); }
      }
  };

  const handleDeletePreset = () => {
      if (selectedPresetId && confirm("Delete?")) { deleteAutomatorPreset(selectedPresetId); setSelectedPresetId(''); }
  };

  return (
    <ReactFlowProvider>
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] gap-6">
      <div className="flex-1 flex flex-col min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between bg-gradient-to-r from-zinc-900 to-black p-4 rounded-2xl border border-zinc-800 shadow-lg gap-4">
            <div className="flex items-center gap-4 shrink-0">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20"><Icons.Automator className="w-6 h-6" /></div>
                <div><h2 className="text-sm font-bold text-white uppercase tracking-wide">Workflow Canvas</h2><p className="text-xs text-zinc-500">{nodes.length} Nodes • {edges.length} Edges</p></div>
            </div>
            
            {/* Live Stats Panel with Reset */}
            <div className="flex items-center gap-4 px-6 bg-white/5 rounded-xl border border-white/5 py-2 shrink-0 overflow-x-auto">
                <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Prompts</span>
                    <span className="text-lg font-mono font-bold text-indigo-400 leading-none">{runStats.promptsSubmitted}</span>
                </div>
                <div className="w-px h-8 bg-white/10"/>
                <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">DLs</span>
                    <span className="text-lg font-mono font-bold text-emerald-400 leading-none">{runStats.downloadsCompleted}</span>
                </div>
                <div className="w-px h-8 bg-white/10"/>
                <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Errors</span>
                    <span className="text-lg font-mono font-bold text-rose-400 leading-none">{runStats.errors}</span>
                </div>
                <button onClick={resetRunStats} className="ml-2 p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/10 rounded-lg transition-colors" title="Reset Stats">
                    <Icons.Refresh className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="flex items-center gap-2 px-4 border-x border-zinc-800 shrink-0">
                <div className="flex items-center gap-1">
                    <input type="text" className="input-field py-1.5 text-xs w-28 bg-zinc-900" placeholder="Preset Name" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}/>
                    <button onClick={handleSavePreset} className="p-1.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/30"><Icons.Check className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-1">
                    <select className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1.5 w-28 focus:outline-none hover:border-zinc-500" onChange={handleLoadPreset} value={selectedPresetId}>
                        <option value="">Load...</option>
                        {(automator.presets || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={handleDeletePreset} disabled={!selectedPresetId} className="p-1.5 rounded text-zinc-400 hover:text-rose-400 disabled:opacity-30"><Icons.Trash className="w-4 h-4" /></button>
                </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0 ml-auto">
                <button onClick={deleteSelected} disabled={!hasSelection} className="btn-secondary text-rose-400 border-rose-900/30 disabled:opacity-30 hidden sm:flex"><Icons.Trash className="w-3 h-3 mr-2" /> Delete</button>
                <div className="w-px h-6 bg-zinc-800 mx-1 hidden sm:block"/>
                <button onClick={clearGraph} className="btn-secondary text-zinc-400 hidden sm:flex">Clear</button>
                <div className="w-px h-6 bg-zinc-800 mx-1 hidden sm:block"/>
                <button onClick={run} disabled={status === 'running'} className="btn-primary pl-4 pr-5 py-2 shadow-indigo-500/20 flex items-center">
                    {status === 'running' ? <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" /> : <Icons.Play className="w-4 h-4 mr-2 fill-current" />} {status === 'running' ? 'Running' : 'Run'}
                </button>
                {status === 'running' && (<><button onClick={skipStep} className="btn-secondary py-2 px-3 text-amber-400 border-amber-500/30" title="Skip current step"><Icons.ChevronRight className="w-4 h-4"/></button><button onClick={stop} className="btn-danger py-2 px-3"><Icons.Stop className="w-4 h-4"/></button></>)}
            </div>
        </div>

        <div className="flex-1 rounded-2xl border border-zinc-800 bg-[#0c0c0e] shadow-inner relative overflow-hidden group min-h-[400px]" ref={reactFlowWrapper}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver} nodeTypes={nodeTypes} fitView deleteKeyCode={['Backspace', 'Delete']} proOptions={{ hideAttribution: true }} className="bg-dots-pattern focus:outline-none" minZoom={0.2}>
                <Background color="#333" gap={24} size={1} />
                <Controls className="!bg-zinc-900 !border-zinc-800 !shadow-xl rounded-lg overflow-hidden fill-zinc-400" />
            </ReactFlow>
            {(!nodes || nodes.length === 0) && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-700 flex-col gap-4"><Icons.Drag className="w-16 h-16 opacity-20" /><p className="text-sm font-medium">Drag items here</p></div>}
        </div>
      </div>

      <div className="w-full lg:w-64 flex flex-col gap-4 bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50 backdrop-blur-sm shrink-0">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-3 mb-1">Toolbox</h3>
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-6 pr-1 max-h-[300px] lg:max-h-none">
            <div className="space-y-2">
                <div className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">Global</div>
                <ToolItem label="Open All Sessions" type="global" icon={<Icons.Sessions className="w-4 h-4"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Open All', type: 'global', idPrefix: 'openSessions' })} />
                <ToolItem label="Consolidate Files" type="global" icon={<Icons.Folder className="w-4 h-4"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Consolidate', type: 'global', idPrefix: 'consolidateFiles' })} />
            </div>

            {sessions.map(s => (
                <div key={s.id} className="space-y-2">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-zinc-600"/> {s.name}</div>
                    <div className="grid gap-2">
                        <ToolItem label="Launch Chrome" type="open" icon={<Icons.Sessions className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Launch', type: 'open', idPrefix: 'openSession', sessionId: s.id, sessionName: s.name })} />
                        <ToolItem label="Generic Action" type="generic" icon={<Icons.Grip className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Generic Action', type: 'generic', idPrefix: 'genericSession', sessionId: s.id, sessionName: s.name, action: 'click', selectorId: '', value: '' })} />
                        <ToolItem label="Prompts" type="prompt" icon={<Icons.Play className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Prompts', type: 'prompt', idPrefix: 'promptsSession', sessionId: s.id, sessionName: s.name })} />
                        <ToolItem label="Download" type="download" icon={<Icons.Downloader className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Download', type: 'download', idPrefix: 'downloadSession', sessionId: s.id, sessionName: s.name })} />
                        <ToolItem label="Clean Metadata" type="clean" icon={<Icons.Code className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Clean Metadata', type: 'clean', idPrefix: 'cleanMetadataSession', sessionId: s.id, sessionName: s.name })} />
                        <ToolItem label="Blur Video" type="blur" icon={<Icons.Watermark className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Blur', type: 'blur', idPrefix: 'blurSession', sessionId: s.id, sessionName: s.name })} />
                        <ToolItem label="Merge Batch" type="merge" icon={<Icons.Combine className="w-3.5 h-3.5"/>} onDragStart={(e: any) => onDragStart(e, 'step', { label: 'Merge', type: 'merge', idPrefix: 'mergeSession', sessionId: s.id, sessionName: s.name })} />
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
    </ReactFlowProvider>
  );
};

const ToolItem = ({ label, type, icon, onDragStart }: any) => {
    let colors = "bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-300";
    if (type === 'open') colors = "bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-500/50 text-cyan-300";
    if (type === 'prompt') colors = "bg-indigo-500/10 border-indigo-500/20 hover:border-indigo-500/50 text-indigo-300";
    if (type === 'download') colors = "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/50 text-emerald-300";
    if (type === 'blur') colors = "bg-blue-500/10 border-blue-500/20 hover:border-blue-500/50 text-blue-300";
    if (type === 'merge') colors = "bg-purple-500/10 border-purple-500/20 hover:border-purple-500/50 text-purple-300";
    if (type === 'clean') colors = "bg-teal-500/10 border-teal-500/20 hover:border-teal-500/50 text-teal-300";
    if (type === 'generic') colors = "bg-slate-500/10 border-slate-500/20 hover:border-slate-500/50 text-slate-300";
    if (type === 'global') colors = "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/50 text-amber-300";

    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all shadow-sm ${colors}`} draggable onDragStart={onDragStart}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
            <Icons.Grip className="w-3 h-3 ml-auto opacity-50"/>
        </div>
    );
};
