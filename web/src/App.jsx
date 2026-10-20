import { RouterProvider } from 'react-router'
import { LucideProvider } from 'lucide-react'
import { router } from '@/app/router'
import { SessionProvider } from '@/app/session'
import { ToastProvider } from '@/app/toast'

// Icons are Lucide at a constant 2 px stroke for every size (Figma: "Icons (Lucide, 20 px)").
export default function App() {
  return (
    <LucideProvider size={20} strokeWidth={2} absoluteStrokeWidth>
      <ToastProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </ToastProvider>
    </LucideProvider>
  )
}
