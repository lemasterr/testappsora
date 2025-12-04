import React, { useState } from 'react';
import { Icons } from './Icons';

const Header = ({ title, desc }: { title: string, desc: string }) => (
    <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-zinc-400">{desc}</p>
    </div>
);

const Section = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="card p-6 border-zinc-800">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-indigo-500 rounded-full"/>
            {title}
        </h3>
        <div className="text-sm text-zinc-400 leading-relaxed space-y-4">
            {children}
        </div>
    </div>
);

const InfoCard = ({ title, icon, children }: any) => (
    <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors">
        <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-black rounded-lg border border-zinc-800">{icon}</div>
            <h4 className="font-bold text-zinc-200">{title}</h4>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">{children}</p>
    </div>
);

const NodeDef = ({ title, color, children }: any) => (
    <div className={`p-5 rounded-2xl border bg-zinc-900/40 ${color ? 'border-' + color.split('-')[1] + '-500/20' : 'border-zinc-800'}`}>
        <div className="flex items-center gap-3 mb-3">
            <div className={`w-3 h-3 rounded-full ${color || 'bg-zinc-500'} shadow-[0_0_10px_currentColor]`} />
            <h4 className="font-bold text-white">{title}</h4>
        </div>
        <div className="text-sm text-zinc-400 pl-6 border-l border-white/5">
            {children}
        </div>
    </div>
);

export const InstructionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('welcome');

  const tabs = [
    { id: 'welcome', label: 'Welcome & Overview', icon: <Icons.SoraLogo className="w-4 h-4"/> },
    { id: 'integrations', label: 'Universal Integrations', icon: <Icons.Code className="w-4 h-4"/> },
    { id: 'automator', label: 'Workflow Automator', icon: <Icons.Automator className="w-4 h-4"/> },
    { id: 'sessions', label: 'Sessions & Profiles', icon: <Icons.Sessions className="w-4 h-4"/> },
    { id: 'tools', label: 'Post-Processing Tools', icon: <Icons.Combine className="w-4 h-4"/> },
    { id: 'settings', label: 'Configuration', icon: <Icons.Settings className="w-4 h-4"/> }
  ];

  return (
    <div className="flex h-full gap-8 animate-fade-in">
      {/* Doc Sidebar */}
      <div className="w-64 flex flex-col gap-2 shrink-0 pt-4">
        {tabs.map(tab => (
            <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id 
                ? 'bg-gradient-to-r from-indigo-600/20 to-blue-600/10 text-white border border-indigo-500/30 shadow-lg shadow-indigo-900/20' 
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
            }`}
            >
                <span className={activeTab === tab.id ? 'text-indigo-400' : 'text-zinc-500'}>{tab.icon}</span>
                {tab.label}
            </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pr-4 pb-20 scrollbar-thin">
          <div className="max-w-4xl space-y-10">
              
              {activeTab === 'welcome' && (
                  <div className="space-y-8">
                      <div className="card p-10 bg-gradient-to-br from-indigo-900/40 via-black to-black border-indigo-500/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h1 className="text-4xl font-bold text-white mb-4">Sora Suite V3.0 Pro</h1>
                            <p className="text-lg text-indigo-200/80 leading-relaxed max-w-2xl">
                                The ultimate universal automation platform. Now featuring a dedicated Landing Experience, Real-time Analytics, Telegram 2.0, and enhanced error logging.
                            </p>
                        </div>
                        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-600/20 blur-[100px] rounded-full pointer-events-none"/>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                          <InfoCard title="Real-Time Stats" icon={<Icons.Dashboard className="text-blue-400"/>}>
                              Monitor Prompts and Downloads live directly inside the Automator panel.
                          </InfoCard>
                          <InfoCard title="Universal Logic" icon={<Icons.Code className="text-emerald-400"/>}>
                              Automate any website using the new Selector Picker and Generic Actions.
                          </InfoCard>
                          <InfoCard title="Telegram 2.0" icon={<Icons.Telegram className="text-sky-400"/>}>
                              Detailed notifications for every step: Start, Errors, Success, and Completion.
                          </InfoCard>
                          <InfoCard title="Local Processing" icon={<Icons.Watermark className="text-rose-400"/>}>
                              FFmpeg-powered tools for watermark removal and video merging.
                          </InfoCard>
                      </div>
                  </div>
              )}

              {activeTab === 'integrations' && (
                  <div className="space-y-8">
                      <Header title="Universal Integrations" desc="Teach the bot how to interact with any website." />
                      
                      <Section title="Concept">
                          <p>
                              An <strong>Integration</strong> is a collection of <strong>Selectors</strong>. A Selector maps a human-readable name (e.g., "Submit Button") to a CSS path on a website.
                              Once defined, these selectors can be used in the Automator to perform actions like Clicking or Typing.
                          </p>
                      </Section>

                      <Section title="How to Pick Selectors">
                          <ol className="space-y-4 list-decimal list-inside text-zinc-300 text-sm">
                              <li className="pl-2"><strong className="text-white">Start Chrome:</strong> Go to the <span className="text-indigo-400">Sessions</span> page and launch a Chrome instance.</li>
                              <li className="pl-2"><strong className="text-white">Go to Integrations:</strong> Open the Integrations tab in this app.</li>
                              <li className="pl-2"><strong className="text-white">Select Picker Session:</strong> Use the dropdown at the top to select the session you just launched.</li>
                              <li className="pl-2"><strong className="text-white">Pick:</strong> Create a new selector and click the <strong>PICK</strong> button.</li>
                              <li className="pl-2"><strong className="text-white">Click Element:</strong> Switch to the Chrome window. Hover over the element you want (it will highlight red). Click it to save.</li>
                          </ol>
                      </Section>
                  </div>
              )}

              {activeTab === 'automator' && (
                  <div className="space-y-8">
                      <Header title="Workflow Automator" desc="Build complex pipelines with nodes." />

                      <div className="grid grid-cols-1 gap-4">
                          <NodeDef title="Generic Action Node" color="bg-slate-500">
                              <p>The swiss-army knife of automation. Perform atomic actions on any site.</p>
                              <ul className="mt-2 space-y-1 text-zinc-400 font-mono text-xs">
                                  <li>• Click (Selector)</li>
                                  <li>• Type (Selector + Text)</li>
                                  <li>• Wait (Selector OR Time in ms)</li>
                                  <li>• Navigate (URL)</li>
                                  <li>• Scroll (Selector)</li>
                              </ul>
                          </NodeDef>

                          <NodeDef title="Prompts Node (Generic Mode)" color="bg-indigo-500">
                              <p>Loops through your <code>_prompts.txt</code> file and submits them one by one.</p>
                              <div className="mt-2 p-3 bg-black/40 rounded border border-white/5">
                                  <span className="text-zinc-500 block text-xs mb-1">Configuration Required:</span>
                                  <div className="text-xs text-indigo-300">1. Input Selector (Textarea)</div>
                                  <div className="text-xs text-emerald-300">2. Submit Selector (Button)</div>
                              </div>
                          </NodeDef>

                          <NodeDef title="Download Node (Sora Mode)" color="bg-emerald-500">
                              <p> Specialized logic for monitoring the Sora feed, downloading new videos, and handling timeouts/retries.</p>
                          </NodeDef>
                      </div>
                  </div>
              )}

              {activeTab === 'sessions' && (
                  <div className="space-y-8">
                      <Header title="Sessions & Profiles" desc="Manage isolated browser environments." />
                      <Section title="Chrome Profiles">
                          <p>
                              Sora Suite works by <strong>cloning</strong> your existing Chrome profiles. This allows you to log in to websites using your main browser, 
                              and then have the bot use a safe copy of that session.
                          </p>
                          <div className="mt-4 p-4 border-l-4 border-amber-500 bg-amber-500/10 text-amber-200 text-sm">
                              <strong>Important:</strong> If you get "Profile in use" errors, ensure you have closed all regular Chrome windows for that profile before launching the bot.
                          </div>
                      </Section>
                      <Section title="Input Files">
                          <p>Each session reads from its own set of files in the <code>_assets</code> folder:</p>
                          <ul className="mt-2 space-y-2 text-sm text-zinc-400 font-mono">
                              <li>[ProfileName]_prompts.txt</li>
                              <li>[ProfileName]_titles.txt</li>
                              <li>[ProfileName]_images.txt</li>
                          </ul>
                          <p className="mt-4 text-xs text-zinc-500 bg-black/40 p-2 rounded border border-white/5 inline-block">
                              Tip: Use the <strong>Content Editor</strong> page to edit these files directly in the app.
                          </p>
                      </Section>
                  </div>
              )}

              {activeTab === 'tools' && (
                  <div className="space-y-8">
                      <Header title="Post-Processing" desc="Clean and merge your content." />
                      <div className="grid grid-cols-2 gap-6">
                          <div className="card p-5 bg-zinc-900/50">
                              <div className="flex items-center gap-3 mb-3 text-rose-400 font-bold">
                                  <Icons.Watermark className="w-5 h-5"/> Watermark Remover
                              </div>
                              <p className="text-xs text-zinc-400 leading-relaxed">
                                  Define blur zones on a preview video. Save these zones as a <strong>Preset</strong>. 
                                  Then, use the "Blur" node in Automator with that preset to batch process downloads.
                              </p>
                          </div>
                          <div className="card p-5 bg-zinc-900/50">
                              <div className="flex items-center gap-3 mb-3 text-purple-400 font-bold">
                                  <Icons.Combine className="w-5 h-5"/> Video Merge
                              </div>
                              <p className="text-xs text-zinc-400 leading-relaxed">
                                  Concatenates multiple MP4 files into a single video. Supports "Batch Size" to split 
                                  large collections into smaller chunks (e.g., 50 videos → 5 videos of 10 clips each).
                              </p>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'settings' && (
                  <div className="space-y-8">
                      <Header title="Settings Reference" desc="Fine-tune the engine." />
                      <table className="w-full text-left text-sm border-collapse">
                          <thead>
                              <tr className="border-b border-white/10 text-zinc-500">
                                  <th className="py-3 font-medium">Setting</th>
                                  <th className="py-3 font-medium">Description</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-zinc-300">
                              <tr><td className="py-3 font-mono text-xs text-indigo-300">CDP Port</td><td className="py-3 text-xs">Port for Chrome remote debugging (Default: 9222).</td></tr>
                              <tr><td className="py-3 font-mono text-xs text-indigo-300">Prompt Delay</td><td className="py-3 text-xs">Milliseconds to wait between prompts in a loop.</td></tr>
                              <tr><td className="py-3 font-mono text-xs text-indigo-300">Download Timeout</td><td className="py-3 text-xs">Max time to wait for a file download before skipping.</td></tr>
                              <tr><td className="py-3 font-mono text-xs text-indigo-300">Max Parallel</td><td className="py-3 text-xs">Number of sessions to run simultaneously in parallel workflows.</td></tr>
                          </tbody>
                      </table>
                  </div>
              )}

          </div>
      </div>
    </div>
  );
};
