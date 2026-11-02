import { DomuSafeApp } from '@/components/DomuSafeApp';

/**
 * Entry App Router: shell client-side per IndexedDB + Web Crypto.
 * Nessun server store obbligatorio per il piano BASIC offline.
 */
export default function HomePage() {
  return <DomuSafeApp />;
}
