
import { ReactNode } from 'react';
import { AppPage } from '../store';
import { Icons } from './Icons';

export interface NavItem {
  key: AppPage;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  currentPage: AppPage;
  collapsed: boolean;
  onNavigate: (page: AppPage) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({ items, currentPage, collapsed, onNavigate, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={`relative flex h-full flex-col border-r border-white/5 bg-[#050507]/60 backdrop-blur-2xl transition-all duration-300 z-20 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex h-16 items-center gap-3 px-4 border-b border-white/5 shrink-0 bg-white/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
          <Icons.Logo className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in flex flex-col justify-center">
            <div className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-400 leading-tight">Universal</div>
            <div className="text-sm font-bold text-white tracking-tight leading-tight">Sora Suite V3.0</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6 scrollbar-thin overflow-y-auto">
        {items.map((item) => {
          const active = currentPage === item.key;
          return (
            <button
              key={item.key}
              title={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.key)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 relative overflow-hidden ${
                active
                  ? 'text-white shadow-inner bg-gradient-to-r from-indigo-500/10 to-transparent border border-indigo-500/20'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              {active && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 shadow-[0_0_10px_#6366f1]" />}
              
              <span className={`transition-colors duration-200 ${active ? 'text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-4 space-y-3 bg-black/20">
        <button
            title={collapsed ? "Instructions" : undefined}
            onClick={() => onNavigate('instructions')}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            currentPage === 'instructions'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'
            } ${collapsed ? 'justify-center px-2' : ''}`}
        >
            <span className={`${currentPage === 'instructions' ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
            <Icons.Help className="h-5 w-5" />
            </span>
            {!collapsed && <span>Docs & Guide</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300 hover:border-white/10"
        >
          {collapsed ? <Icons.ChevronRight className="h-4 w-4" /> : <span className="flex items-center gap-2">V3.0 Pro <span className="text-[9px] opacity-50">Stable</span></span>}
        </button>
      </div>
    </aside>
  );
}
