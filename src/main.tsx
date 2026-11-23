import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import './styles/tokens.css'
import './styles/app.css'
// One stylesheet per idle-loop feature, so features never edit the same CSS.
import './styles/features/journal.css'
import './styles/features/almanac.css'
import './styles/features/recap.css'
import './styles/features/workshop.css'
import './styles/features/visitors.css'
import './styles/features/fishing.css'
import './styles/features/restoration.css'
import './styles/features/mail.css'
import './styles/features/stamps.css'
import './styles/features/cottage.css'
import './styles/features/studio.css'
import './styles/features/attention.css'
import './styles/features/atmosphere.css'
import './styles/features/git.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
