import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const PUBLISHABLE_KEY = (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_YnJpZWYtbWVlcmthdC0zMC5jbGVyay5hY2NvdW50cy5kZXYk';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        signInForceRedirectUrl="/"
        signUpForceRedirectUrl="/"
      >
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
