import '@testing-library/jest-dom/vitest'
import { loadLanguage } from '@/i18n'

// The app shows Vietnamese by default and loads the screens' texts before the first screen is drawn; tests do the same,
// so a label is checked in the language the user reads (a missing translation shows as English and fails).
await loadLanguage('vi')
