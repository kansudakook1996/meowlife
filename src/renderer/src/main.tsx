import '@fontsource/mali/400.css'
import '@fontsource/mali/600.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/600.css'
import './styles/theme.css'
import './styles/app.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
