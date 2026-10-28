import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './authContext.jsx'
import { DataProvider } from './DataContext.jsx'
import { SimResultsProvider } from './simResultsContext.jsx'
import { initAnalytics } from './analytics.js'
import './styles.css'

// PostHog genau einmal initialisieren (No-Op ohne konfigurierten Key).
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <SimResultsProvider>
            <App />
          </SimResultsProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
