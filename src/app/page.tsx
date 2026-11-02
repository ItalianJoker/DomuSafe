import { DomuSafeApp } from '@/components/DomuSafeApp';

/**
 * Entry App Router: shell client DomuSafe (account → Famiglia → Web Crypto).
 * Fonte di verità: account Residente/Famiglia, non IndexedDB/localStorage.
 */
export default function HomePage() {
  return <DomuSafeApp />;
}
