import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { createApi } from '@/lib/api.js';
import { createSession } from '@/lib/session.js';
import { watchSystemTheme } from '@/lib/theme.js';
import { getLocale } from '@/paraglide/runtime.js';
import { createAppRouter } from '@/router.js';
import '@/styles/app.css';

registerSW({ immediate: true });
watchSystemTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
});
const api = createApi({
  locale: () => (getLocale() === 'en' ? 'en' : 'it'),
});
const router = createAppRouter({ queryClient, api, session: createSession() });

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
