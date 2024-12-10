import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TestPage from './TestPage.jsx'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TestPage/>
    <Toaster/>
  </StrictMode>,
)
