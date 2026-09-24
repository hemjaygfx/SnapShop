import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClerkProvider } from '@clerk/react'

import * as Sentry from '@sentry/browser'
import * as SentryReact from '@sentry/react'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SentryErrorFallback } from './components/SentryErrorFallback.jsx'
import { SentryUserSync } from './components/SentryUserSync.jsx'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ""
const tracePropagationTargets =
  apiBaseUrl.length > 0 ? [apiBaseUrl] : typeof window !== "undefined" ? [window.location.origin] : [];

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
});

const queryClient = new QueryClient();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <SentryUserSync />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SentryReact.ErrorBoundary fallback={<SentryErrorFallback />}>
            <App />
          </SentryReact.ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>,
)
