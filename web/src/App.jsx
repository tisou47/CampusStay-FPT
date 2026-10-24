import { RouterProvider } from 'react-router'
import { LucideProvider } from 'lucide-react'
import { router } from '@/app/router'
import { SessionProvider } from '@/app/session'
import { ToastProvider } from '@/app/toast'
import { I18nProvider } from '@/i18n'

// Icons are Lucide at a constant 2 px stroke for every size (Figma: "Icons (Lucide, 20 px)").
// The language provider is outermost: changing the language re-renders every screen (ADR-25).
export default function App() {
  return (
    <I18nProvider>
      <LucideProvider size={20} strokeWidth={2} absoluteStrokeWidth>
        <ToastProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </ToastProvider>
      </LucideProvider>
    </I18nProvider>
  )
}
