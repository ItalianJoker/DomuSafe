import { useQueryClient } from '@tanstack/react-query';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useEffect, useState } from 'react';
import { m } from '@/paraglide/messages.js';
import { FamilyRealtimeClient, type SyncConnectionState } from './realtime-client.js';

/**
 * Compact connection status for the shell header.
 *
 * Preconditions: rendered inside the family shell with a known plan.
 * Postconditions: when Premium (or trial) is active, opens a WebSocket and invalidates queries on events.
 * Data contract: the badge shows only connection state; events never carry contents.
 *
 * @param props - Family, house and plan.
 * @returns Status text for the header.
 */
export function SyncStatus(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly plan: PlanTier;
}) {
  const enabled = hasFeature(props.plan, 'realtime_sync');
  const [state, setState] = useState<SyncConnectionState>(enabled ? 'connecting' : 'unavailable');
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = new FamilyRealtimeClient({
      familyId: props.familyId,
      houseId: props.houseId,
      enabled,
      onState: setState,
      onEvent: (event) => {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key)) {
              return false;
            }
            if (key[0] === 'notifications' || event.kind === 'notification.created') {
              return true;
            }
            return (
              key.includes(props.familyId) || key.includes(props.houseId) || key.includes(event.resource)
            );
          },
        });
      },
      onSessionRevoked: () => {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      },
    });
    client.start();
    return () => {
      client.stop();
    };
  }, [enabled, props.familyId, props.houseId, queryClient]);

  return (
    <p
      className="hidden truncate text-[12px] text-muted-foreground sm:block"
      aria-live="polite"
      title={label(state)}
    >
      {label(state)}
    </p>
  );
}

function label(state: SyncConnectionState): string {
  switch (state) {
    case 'connecting':
      return m.syncConnecting();
    case 'live':
      return m.syncLive();
    case 'reconnecting':
      return m.syncReconnecting();
    case 'offline':
      return m.syncOffline();
    case 'unavailable':
      return m.syncUnavailable();
  }
}
