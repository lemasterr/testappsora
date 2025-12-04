
import React, { useState } from 'react';
import { Icons } from './Icons';

interface HelpTipProps {
  title: string;
  children: React.ReactNode;
}

export const HelpTip: React.FC<HelpTipProps> = ({ title, children }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block ml-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="w-4 h-4 rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-[10px] font-bold transition-colors"
        title="More info"
      >
        ?
      </button>
      
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 animate-fade-in origin-bottom">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-800">
                <Icons.Help className="w-3 h-3 text-indigo-400" />
                <span className="text-xs font-bold text-white uppercase">{title}</span>
            </div>
            <div className="text-xs text-zinc-400 leading-relaxed">
                {children}
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-3 h-3 bg-zinc-900 border-r border-b border-zinc-700"></div>
          </div>
        </>
      )}
    </div>
  );
};
