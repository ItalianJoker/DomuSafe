/**
 * Pagina pubblica scan QR (ospiti / Airbnb).
 * Params in Suspense (cacheComponents): shell statico + ack client.
 */
import { Suspense } from 'react';
import { ScanAck } from '@/components/ScanAck';

type Props = { params: Promise<{ token: string }> };

async function ScanAckFromParams({ params }: Props) {
  const { token } = await params;
  return <ScanAck token={token} />;
}

export default function ScanPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--brand-ink)] text-white">
          <p className="font-semibold">Registrazione accesso…</p>
        </main>
      }
    >
      <ScanAckFromParams params={params} />
    </Suspense>
  );
}
