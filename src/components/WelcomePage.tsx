
import React from 'react';
import { useAppStore } from '../store';
import { Icons } from './Icons';

export const WelcomePage: React.FC = () => {
  const { setHasStarted } = useAppStore();

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#020203] text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] h-[800px] w-[800px] rounded-full bg-indigo-900/20 blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-violet-900/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 text-center animate-fade-in-up">
        {/* Logo Container */}
        <div className="group relative">
          <div className="absolute inset-0 -inset-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 opacity-20 blur-xl group-hover:opacity-40 transition-opacity duration-1000" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#0c0c0e] to-[#050507] border border-white/10 shadow-2xl">
            <Icons.SoraLogo className="h-12 w-12 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <h1 className="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-zinc-200 to-zinc-500">
            Sora Suite
          </h1>
          <p className="text-lg text-zinc-400 font-light leading-relaxed">
            The advanced automation platform for generative media. 
            Orchestrate complex workflows, manage sessions, and accelerate your creative pipeline.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 mt-8">
          <button
            onClick={() => setHasStarted(true)}
            className="group relative flex items-center gap-3 rounded-full bg-white px-10 py-4 text-black font-bold text-sm tracking-wide uppercase hover:scale-105 transition-transform duration-300 border border-white/20 animate-glow"
          >
            Start Automation
            <Icons.ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          
          <div className="flex items-center gap-6 mt-12 text-xs font-mono text-zinc-600 uppercase tracking-widest">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" /> V3.0 Pro</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" /> Universal</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_#a855f7]" /> Secure</span>
          </div>
        </div>
      </div>
    </div>
  );
};
