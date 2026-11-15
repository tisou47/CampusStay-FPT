import { RouterProvider } from 'react-router'
import { LucideProvider } from 'lucide-react'
import { router } from '@/app/router'
import { SessionProvider } from '@/app/session'
import { ToastProvider } from '@/app/toast'
import { I18nProvider, LanguageScope } from '@/i18n'

// Icons are Lucide at a constant 2 px stroke for every size (Figma: "Icons (Lucide, 20 px)").
// The language provider is outermost; LanguageScope rebuilds the screens in a new language (ADR-25) while the
// session (user, Term, Block scope) above it stays.
export default function App() {
  return (
    <I18nProvider>
      <LucideProvider size={20} strokeWidth={2} absoluteStrokeWidth>
        <ToastProvider>
          <SessionProvider>
            <LanguageScope>
              <RouterProvider router={router} />
            </LanguageScope>
          </SessionProvider>
        </ToastProvider>
      </LucideProvider>
    </I18nProvider>
  )
}
