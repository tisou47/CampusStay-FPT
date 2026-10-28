import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'
import { getLang, loadLanguage } from './i18n'

// The first screen renders in its language at once: the Vietnamese texts are loaded first when they are needed.
loadLanguage(getLang()).then(() =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
