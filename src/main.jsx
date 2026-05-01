import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
  variables: {
    colorBackground: '#0b0d10',
    colorInputBackground: '#0b0d10',
    colorPrimary: '#7aa2ff',
    colorText: '#e6e8eb',
    colorTextSecondary: '#8b93a1',
    colorInputText: '#e6e8eb',
    colorDanger: '#f87171',
    borderRadius: '0.5rem',
    fontSize: '14px',
  },
  elements: {
    card: {
      backgroundColor: '#15181d',
      border: '1px solid #23272e',
      boxShadow: 'none',
    },
    headerTitle: { color: '#e6e8eb' },
    headerSubtitle: { color: '#8b93a1' },
    socialButtonsBlockButton: {
      backgroundColor: '#15181d',
      border: '1px solid #2f3441',
      color: '#e6e8eb',
    },
    formFieldInput: {
      backgroundColor: '#0b0d10',
      border: '1px solid #2f3441',
      color: '#e6e8eb',
    },
    footerActionLink: { color: '#7aa2ff' },
  },
};

const root = ReactDOM.createRoot(document.getElementById('root'));

if (PUBLISHABLE_KEY) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={clerkAppearance}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
} else {
  // No Clerk key configured — run BYOK-only. Subscribe path will display a config-needed message.
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
