
import React, { useEffect, useState, useRef } from 'react';
import {
  type WatermarkMask,
  type WatermarkRect,
} from '../../shared/types';
import { useAppStore } from '../store';
import { Icons } from './Icons';

interface EnhancedRect extends WatermarkRect {
  mode: 'blur' | 'delogo' | 'hybrid';
  blur_strength: number;
  band: number;
}

export const WatermarkPage: React.FC = () => {
  const { config, refreshConfig } = useAppStore();
  const [selected, setSelected] = useState<string>(() => localStorage.getItem('wm_last_video') || '');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [masks, setMasks] = useState<WatermarkMask[]>([]);
  const [activeMaskId, setActiveMaskId] = useState<string>('');
  const [rects, setRects] = useState<EnhancedRect[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [busy, setBusy] = useState(false);
  const [presetName, setPresetName] = useState('');
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const list = await window.electronAPI.video.blurProfiles.list();
      if (Array.isArray(list)) {
          setMasks(list);
          if (config?.activeWatermarkMaskId) {
              setActiveMaskId(config.activeWatermarkMaskId);
              const active = list.find(m => m.id === config.activeWatermarkMaskId);
              if (active && active.rects) setRects(active.rects as EnhancedRect[]);
          } else if (list.length > 0) {
              setActiveMaskId(list[0].id);
          }
      }
    };
    load();
  }, [config]);

  useEffect(() => {
    if (selected) localStorage.setItem('wm_last_video', selected);
  }, [selected]);

  // Keyboard shortcuts (Space for Play/Pause)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
            e.preventDefault();
            togglePlay();
        }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setPreviewUrl(URL.createObjectURL(file));
        setSelected((file as any).path || file.name);
        setStatus(`Loaded: ${file.name}`);
        // FIX: Do NOT clear rects here to preserve selected preset
        // setRects([]); 
        setProgress(0);
        setIsPlaying(false);
    }
  };

  const togglePlay = () => {
      if (videoRef.current) {
          if (videoRef.current.paused) {
              videoRef.current.play();
              setIsPlaying(true);
          } else {
              videoRef.current.pause();
              setIsPlaying(false);
          }
      }
  };

  const handleTimeUpdate = () => {
      if (videoRef.current) {
          const current = videoRef.current.currentTime;
          const dur = videoRef.current.duration;
          setCurrentTime(current);
          if (dur > 0) setProgress((current / dur) * 100);
      }
  };

  const handleLoadedMetadata = () => {
      if (videoRef.current) {
          setDuration(videoRef.current.duration);
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setProgress(val);
      if (videoRef.current && duration > 0) {
          videoRef.current.currentTime = (val / 100) * duration;
      }
  };

  const formatTime = (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // --- Coordinate Mathematics ---
  // Calculates the actual position of the video content inside the container, excluding black bars (object-fit: contain)
  const getVideoRenderMetrics = (video: HTMLVideoElement, container: HTMLElement) => {
      const videoRatio = video.videoWidth / video.videoHeight;
      const containerRatio = container.offsetWidth / container.offsetHeight;

      let renderWidth, renderHeight, renderLeft, renderTop;

      if (containerRatio > videoRatio) {
          // Container is wider than video (Bars on Left/Right)
          renderHeight = container.offsetHeight;
          renderWidth = renderHeight * videoRatio;
          renderTop = 0;
          renderLeft = (container.offsetWidth - renderWidth) / 2;
      } else {
          // Container is taller than video (Bars on Top/Bottom)
          renderWidth = container.offsetWidth;
          renderHeight = renderWidth / videoRatio;
          renderLeft = 0;
          renderTop = (container.offsetHeight - renderHeight) / 2;
      }

      return { renderWidth, renderHeight, renderLeft, renderTop, scale: video.videoWidth / renderWidth };
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    if (!videoRef.current || !containerRef.current) return;
    
    // Don't draw if controls clicked
    if ((e.target as HTMLElement).closest('.controls-bar')) return;

    const video = videoRef.current;
    const container = containerRef.current;
    
    if (video.videoWidth === 0) return;

    const metrics = getVideoRenderMetrics(video, container);
    const rect = container.getBoundingClientRect();
    
    // Mouse relative to container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if click is inside the actual video area
    if (
        mouseX < metrics.renderLeft || 
        mouseX > metrics.renderLeft + metrics.renderWidth || 
        mouseY < metrics.renderTop || 
        mouseY > metrics.renderTop + metrics.renderHeight
    ) {
        return;
    }

    const videoX = (mouseX - metrics.renderLeft) * metrics.scale;
    const videoY = (mouseY - metrics.renderTop) * metrics.scale;
    
    // Default box size
    const boxW = Math.floor(video.videoWidth * 0.15);
    const boxH = Math.floor(video.videoHeight * 0.10);

    addZone(videoX - (boxW/2), videoY - (boxH/2), boxW, boxH);
  };

  const addZone = (x: number, y: number, w: number, h: number) => {
    const newRect: EnhancedRect = {
        x: Math.floor(Math.max(0, x)), 
        y: Math.floor(Math.max(0, y)), 
        width: Math.floor(w), 
        height: Math.floor(h),
        label: `Zone ${rects.length + 1}`,
        mode: 'blur', blur_strength: 20, band: 4
    };
    setRects([...rects, newRect]);
  };

  const updateZone = (index: number, field: keyof EnhancedRect, value: any) => {
    const updated = [...rects];
    updated[index] = { ...updated[index], [field]: value };
    setRects(updated);
  };

  const removeZone = (index: number) => {
    setRects(rects.filter((_, i) => i !== index));
  };

  const savePreset = async () => {
      if (!presetName) return setStatus('Enter preset name');
      const newMask = { id: activeMaskId || undefined, name: presetName, rects };
      const updated = await window.electronAPI.video.blurProfiles.save(newMask);
      setMasks(updated);
      setStatus('Preset saved');
  };

  const setAsActive = async () => {
      const mask = masks.find(m => m.id === activeMaskId);
      if (!mask) return;
      await window.electronAPI.config.update({
          activeWatermarkMaskId: activeMaskId,
          watermarkMasks: masks.map(m => m.id === activeMaskId ? {...m, rects} : m)
      });
      await refreshConfig();
      setStatus('Set as active for Automator');
  };

  const runBlur = async () => {
    if (!selected || rects.length === 0) return setStatus("Select video and add zones");
    setBusy(true);
    setStatus("Processing...");
    try {
        const res = await window.electronAPI.video.runBlur(selected, rects);
        setStatus(res.ok ? `Saved: ${res.output.split('/').pop()}` : `Error: ${res.error}`);
    } catch (e) { setStatus(`Exception: ${(e as Error).message}`); }
    setBusy(false);
  };

  const handleOpenFolder = () => {
    if (!selected) return;
    const dir = selected.replace(/[/\\][^/\\]+$/, '');
    if (dir) window.electronAPI.system.openPath(dir);
  };

  const getRenderStyle = (r: EnhancedRect) => {
      if (!videoRef.current || !containerRef.current) return { display: 'none' };
      const video = videoRef.current;
      const container = containerRef.current;
      
      if (video.videoWidth === 0) return { display: 'none' };

      const metrics = getVideoRenderMetrics(video, container);

      return {
          left: metrics.renderLeft + (r.x / metrics.scale),
          top: metrics.renderTop + (r.y / metrics.scale),
          width: r.width / metrics.scale,
          height: r.height / metrics.scale
      };
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Icons.Watermark className="w-6 h-6 text-indigo-400" /> Watermark Remover
          </h2>
          <p className="text-sm text-zinc-400">Click video to add zones. <span className="text-zinc-500">(Zones map to source resolution)</span></p>
        </div>
        <div className="text-xs text-zinc-500 font-mono bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">{status}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
            {/* Video Container */}
            <div
                ref={containerRef}
                className="flex-1 card flex items-center justify-center bg-black border-zinc-800 relative overflow-hidden group cursor-crosshair min-h-0"
                onClick={handleVideoClick}
            >
                {previewUrl ? (
                    <>
                        <video 
                            ref={videoRef} 
                            src={previewUrl} 
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                            playsInline
                        />
                        {rects.map((r, i) => (
                            <div key={i} className="absolute border-2 border-indigo-500/70 bg-indigo-500/20 flex flex-col items-center justify-center text-[10px] text-white font-bold shadow-lg pointer-events-none backdrop-blur-[1px]"
                                style={getRenderStyle(r) as React.CSSProperties}>
                                <span>{i + 1}</span>
                                <span className="text-[8px] uppercase opacity-70">{r.mode}</span>
                            </div>
                        ))}
                    </>
                ) : (
                    <div className="text-zinc-600 flex flex-col items-center gap-4 pointer-events-auto">
                        <Icons.Watermark className="w-16 h-16 opacity-20" />
                        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">Select Video File</button>
                    </div>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileSelect} />
            </div>

            {/* Controls Bar */}
            {previewUrl && (
                <div className="controls-bar card p-3 bg-zinc-900/80 flex items-center gap-4 border border-zinc-800 shrink-0">
                    <button onClick={togglePlay} className="text-zinc-300 hover:text-white transition-colors p-1">
                        {isPlaying ? <Icons.Stop className="w-5 h-5 fill-current"/> : <Icons.Play className="w-5 h-5 fill-current"/>}
                    </button>
                    
                    <span className="text-xs font-mono text-zinc-400 w-12 text-right">{formatTime(currentTime)}</span>
                    
                    <div className="flex-1 relative h-6 flex items-center group">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full h-1 bg-zinc-700 rounded-full">
                                <div className="h-full bg-indigo-500 rounded-full relative" style={{ width: `${progress}%` }}>
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </div>
                            </div>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="100" step="0.1"
                            value={progress}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    
                    <span className="text-xs font-mono text-zinc-500 w-12">{formatTime(duration)}</span>
                </div>
            )}
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          {/* Controls Panel */}
          <div className="card p-5 space-y-4 bg-zinc-900/40">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Settings</h3>
            </div>

            <div className="flex gap-2">
                <select className="select-field flex-1 bg-black/20" value={activeMaskId} onChange={(e) => setActiveMaskId(e.target.value)}>
                  <option value="">Load Preset...</option>
                  {masks.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input
                    className="input-field w-1/2 bg-black/20"
                    placeholder="Preset Name"
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                />
            </div>

            <div className="flex gap-2">
                <button onClick={savePreset} className="btn-secondary flex-1 text-xs border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10">Save Preset</button>
                <button onClick={setAsActive} className="btn-secondary flex-1 text-xs border-blue-500/20 text-blue-400 hover:bg-blue-500/10">Use in Auto</button>
            </div>

            <div className="pt-2 border-t border-zinc-800/50 flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex-1 text-xs">Change Video</button>
                <button onClick={handleOpenFolder} className="btn-secondary w-10 justify-center"><Icons.Folder className="w-4 h-4"/></button>
            </div>
            <button onClick={runBlur} disabled={busy} className="btn-primary w-full py-2.5 shadow-indigo-500/20">{busy ? <Icons.Refresh className="w-4 h-4 animate-spin mr-2"/> : <Icons.Play className="w-4 h-4 mr-2"/>} Process Now</button>
          </div>

          {/* Zones List */}
          <div className="card p-5 bg-zinc-900/40 flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-3 shrink-0">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Zones ({rects.length})</h3>
                <button onClick={() => setRects([])} className="text-[10px] text-rose-500 hover:text-rose-400">Clear All</button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 scrollbar-thin flex-1">
              {rects.map((r, i) => (
                <div key={i} className="bg-[#050507] p-3 rounded-lg border border-zinc-800 space-y-3 hover:border-indigo-500/30 transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"/> Zone {i+1}
                    </span>
                    <button onClick={() => removeZone(i)} className="text-zinc-600 hover:text-rose-500"><Icons.Trash className="w-3.5 h-3.5"/></button>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {['x', 'y', 'width', 'height'].map((k) => (
                        <div key={k} className="relative">
                            <input type="number" value={r[k as keyof EnhancedRect] as number} onChange={e => updateZone(i, k as any, +e.target.value)} className="input-field px-1 py-1 text-[10px] text-center bg-zinc-900 border-zinc-800 focus:border-indigo-500/50" />
                            <span className="absolute -top-2 left-1 text-[8px] text-zinc-600 uppercase bg-[#050507] px-0.5">{k.charAt(0)}</span>
                        </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[9px] text-zinc-500 uppercase mb-1">Mode</label>
                        <select value={r.mode} onChange={e => updateZone(i, 'mode', e.target.value)} className="select-field py-1 text-[10px] h-7 bg-zinc-900 border-zinc-800">
                            <option value="blur">Blur</option>
                            <option value="delogo">Delogo</option>
                            <option value="hybrid">Hybrid</option>
                        </select>
                    </div>
                    {r.mode === 'blur' && <div><label className="block text-[9px] text-zinc-500 uppercase mb-1">Strength</label><input type="number" value={r.blur_strength} onChange={e => updateZone(i, 'blur_strength', +e.target.value)} className="input-field py-1 text-[10px] h-7 bg-zinc-900 border-zinc-800" /></div>}
                    {(r.mode === 'delogo' || r.mode === 'hybrid') && <div><label className="block text-[9px] text-zinc-500 uppercase mb-1">Band</label><input type="number" value={r.band} onChange={e => updateZone(i, 'band', +e.target.value)} className="input-field py-1 text-[10px] h-7 bg-zinc-900 border-zinc-800" /></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
