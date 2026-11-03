/**
 * Pagina pubblica break-glass L1/L2 — zero login.
 * Params in Suspense (cacheComponents).
 */
import { Suspense } from 'react';
import { BreakGlassViewer } from '@/components/BreakGlassViewer';

type Props = { params: Promise<{ token: string }> };

async function ViewerFromParams({ params }: Props) {
  const { token } = await params;
  return <BreakGlassViewer token={token} />;
}

export default function EmergencyPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--brand-ink)] text-white">
          <p className="font-semibold">Apertura emergenza…</p>
        </main>
      }
    >
      <ViewerFromParams params={params} />
    </Suspense>
  );
}
