import React, { useEffect, useState, useRef } from 'react';
import { Icons } from './Icons';

interface VideoFile {
  path: string;
  name: string;
  size: number;
  mtime: number;
  sessionId: string;
  sessionName: string;
  type: 'raw' | 'clean';
}

export const GalleryPage: React.FC = () => {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
        const res = await window.electronAPI.gallery.scan();
        if (Array.isArray(res)) setVideos(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = videos.filter(v => 
    v.name.toLowerCase().includes(filter.toLowerCase()) || 
    v.sessionName.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between p-6 rounded-3xl bg-gradient-to-br from-indigo-900/20 via-zinc-900/50 to-black border border-white/10 shadow-xl">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 border border-indigo-500/30">
                    <Icons.Gallery className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Media Gallery</h2>
                    <p className="text-sm text-zinc-400">Browse and manage generated content.</p>
                </div>
            </div>
            <div className="flex gap-3">
                <input 
                    type="text" 
                    className="input-field w-64 bg-black/40 border-white/10" 
                    placeholder="Search files or sessions..." 
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <button onClick={load} className="btn-secondary"><Icons.Refresh className="w-4 h-4"/></button>
            </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
            {loading ? (
                <div className="flex h-full items-center justify-center text-zinc-500 animate-pulse">Scanning session folders...</div>
            ) : filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-zinc-600 gap-4">
                    <Icons.Gallery className="w-16 h-16 opacity-20" />
                    <p>No videos found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pr-2">
                    {filtered.map((video) => (
                        <VideoCard key={video.path} video={video} playing={playing === video.path} setPlaying={setPlaying} />
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};

interface VideoCardProps {
  video: VideoFile;
  playing: boolean;
  setPlaying: (id: string | null) => void;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, playing, setPlaying }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (playing) videoRef.current?.play().catch(() => {});
        else {
            videoRef.current?.pause();
            if (videoRef.current) videoRef.current.currentTime = 0;
        }
    }, [playing]);

    return (
        <div 
            className="group relative aspect-[9/16] bg-black rounded-xl border border-zinc-800 overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-900/20 transition-all"
            onMouseEnter={() => setPlaying(video.path)}
            onMouseLeave={() => setPlaying(null)}
            onClick={() => window.electronAPI.system.openPath(video.path)}
        >
            <video 
                ref={videoRef}
                src={`file://${video.path}`} 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                muted
                loop
                playsInline
            />
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end pointer-events-none">
                <div className="text-xs font-bold text-white truncate">{video.name}</div>
                <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 truncate max-w-[80px]">{video.sessionName}</span>
                    <span className="text-[9px] text-zinc-500 font-mono">{(video.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
            </div>

            {video.type === 'clean' && (
                <div className="absolute top-2 right-2 bg-emerald-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">CLEAN</div>
            )}
        </div>
    );
};