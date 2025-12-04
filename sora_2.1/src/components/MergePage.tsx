
import { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { useAppStore } from '../store';

export function MergePage() {
  const { config, refreshConfig } = useAppStore();
  const [inputDir, setInputDir] = useState('');
  const [status, setStatus] = useState('Ready');
  const [isMerging, setIsMerging] = useState(false);
  const [globalBatchSize, setGlobalBatchSize] = useState(0);

  useEffect(() => {
      if (config) setGlobalBatchSize(config.mergeBatchSize ?? 0);
  }, [config]);

  const updateBatchSize = async (val: number) => {
      setGlobalBatchSize(val);
      await window.electronAPI.config.update({ mergeBatchSize: val });
      refreshConfig();
  };

  const selectFolder = async () => {
    const path = await window.electronAPI.files.choose('folder');
    if (path) setInputDir(path);
  };

  const runMerge = async () => {
    if (!inputDir) return;
    setIsMerging(true);
    setStatus('Merging videos...');
    try {
      const outputPath = `${inputDir}/merged_video_${Date.now()}.mp4`;
      const res = await window.electronAPI.video.merge(inputDir, outputPath);
      setStatus(res.ok ? 'Merge Complete!' : `Error: ${res.error}`);
    } catch (e) {
      setStatus('Error occurred');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pt-10 space-y-6">
      <div className="card p-8 bg-gradient-to-br from-zinc-900 to-black border-zinc-800 shadow-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400">
            <Icons.Combine className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Video Merge</h2>
            <p className="text-sm text-zinc-400">Combine multiple MP4 clips into a single file.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Input Directory</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={inputDir} 
                readOnly 
                className="input-field bg-zinc-950/50 font-mono text-xs" 
                placeholder="Select folder containing .mp4 files..." 
              />
              <button onClick={selectFolder} className="btn-secondary whitespace-nowrap">Browse</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Global Batch Size</label>
            <input 
                type="number" 
                value={globalBatchSize}
                onChange={e => updateBatchSize(+e.target.value)}
                className="input-field bg-zinc-950/50"
                placeholder="0 = Merge All"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Default setting for automator. 0 merges all files into one. Higher numbers split into parts.</p>
          </div>

          <div className="pt-6 border-t border-zinc-800 flex items-center justify-between">
            <div className={`text-sm font-medium font-mono ${status.includes('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
              {status}
            </div>
            <button 
              onClick={runMerge} 
              disabled={!inputDir || isMerging}
              className="btn-primary px-8 py-3 text-sm shadow-lg shadow-violet-500/20 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            >
              {isMerging ? <Icons.Refresh className="w-4 h-4 animate-spin mr-2" /> : <Icons.Combine className="w-4 h-4 mr-2" />}
              Start Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
