import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useBlockScannerBrowserShortcuts } from '../lib/scannerGuard'

export default function Layout({ children, bg = 'bg-slate-50' }: { children: ReactNode; bg?: string }) {
  useBlockScannerBrowserShortcuts()
  return (
    <div className={`flex h-screen overflow-hidden ${bg}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
