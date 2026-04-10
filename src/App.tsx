import { useState } from 'react';
import { Server, Globe, AlertTriangle } from 'lucide-react';
import logo from './assets/logo.png';
import ServerSimulator from './components/ServerSimulator';
import ClientSimulator from './components/ClientSimulator';

type Tab = 'server' | 'client';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('server');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Risk banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2 text-xs text-amber-800">
        <AlertTriangle size={13} className="shrink-0 text-amber-500" />
        <span>
          This tool is provided for testing purposes only. Use of this service is entirely at your own risk.
          Do not use real funds or sensitive credentials.
        </span>
      </div>
      
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center">
            <img src={logo} alt="x402 Testing Tool" className="h-14 w-auto my-auto" />
          </div>

          <div className="ml-auto flex items-center gap-[18px] bg-gray-100 rounded-lg p-2">
            <button
              onClick={() => setActiveTab('server')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'server'
                  ? 'bg-stellar-600 text-white shadow'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Server size={14} />
              Server Simulator
            </button>
            <button
              onClick={() => setActiveTab('client')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'client'
                  ? 'bg-stellar-600 text-white shadow'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Globe size={14} />
              Client Simulator
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === 'server' ? <ServerSimulator /> : <ClientSimulator />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-3 text-center text-xs text-gray-400">
        x402 Testing Tool · by Carsten Jacobsen · <a href="https://github.com/carstenjacobsen/x402-testing-tool" className="text-gray-400 hover:text-gray-600" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
