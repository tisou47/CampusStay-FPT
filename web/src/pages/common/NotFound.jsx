import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'
import { t } from '@/i18n'

export default function NotFound() {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <EmptyState icon={Compass} title="Page not found" action={<Button variant="primary" size="lg" to="/signin">Go to sign in</Button>}>
        {t('This address does not exist in CampusStay. Check the link or go back to the start page.')}
      </EmptyState>
    </div>
  )
}
