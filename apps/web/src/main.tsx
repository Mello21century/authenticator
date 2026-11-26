import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokens } from '@auth/shared';
import { LockScreen, useLock } from './components/LockGate';
import { baseUrl } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { desktop } from './lib/desktop';
import { ToastProvider } from './lib/ui';
import { Forgot, Login, Reset, Signup } from './pages/AuthPages';
import Settings from './pages/Settings';
import Vault from './pages/Vault';
import './styles.css';

// tokens → CSS variables (dark default, light via prefers-color-scheme)
const vars = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `--${k}:${v};`).join('');
const style = document.createElement('style');
style.textContent = `:root{${vars(tokens.color.dark)}--font:${tokens.font.family};--mono:${tokens.font.mono};}
@media (prefers-color-scheme: light){:root{${vars(tokens.color.light)}}}`;
document.head.appendChild(style);

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
function Public({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

function App() {
  const { user } = useAuth();
  const { locked, unlock } = useLock();
  const isLocked = !!user && locked;
  return (
    <>
      <Routes>
        <Route path="/login" element={<Public><Login /></Public>} />
        <Route path="/signup" element={<Public><Signup /></Public>} />
        <Route path="/forgot" element={<Public><Forgot /></Public>} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/" element={<Protected><Vault locked={isLocked} /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isLocked && <LockScreen onUnlocked={unlock} />}
    </>
  );
}

async function start() {
  if (desktop) baseUrl.current = await desktop.getApiUrl();
  // desktop serves files from app://, where hash routing avoids server rewrites
  const Router = desktop ? HashRouter : BrowserRouter;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <Router>
          <ToastProvider>
            <AuthProvider><App /></AuthProvider>
          </ToastProvider>
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void start();
