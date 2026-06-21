import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import AiAssistantWidget from './AiAssistantWidget'
import { useBlockScannerBrowserShortcuts } from '../lib/scannerGuard'
import { useAuth } from '../lib/auth'

function DemoBanner() {
  const { tenant } = useAuth()
  if (!tenant?.is_demo) return null
  return (
    <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-900">
      <strong>Demo mode</strong> — exports, bulk import, and password changes are disabled. Contact Fratelanza for a full account.
    </div>
  )
}

export default function Layout({ children, bg = 'bg-slate-50' }: { children: ReactNode; bg?: string }) {
  useBlockScannerBrowserShortcuts()
  return (
    <div className={`flex h-screen overflow-hidden ${bg}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <DemoBanner />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </div>
      </div>
      <AiAssistantWidget />
    </div>
  )
}
