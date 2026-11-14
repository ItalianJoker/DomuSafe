import type { Me, NotificationPreference } from '@domusafe/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
import { problemText } from '@/lib/copy.js';
import { m } from '@/paraglide/messages.js';
import {
  disableBrowserDeadlineAlerts,
  enableBrowserDeadlineAlerts,
  pushPermissionState,
} from './browser-notifications.js';

/**
 * Account control that turns browser deadline alerts on or off for the open family.
 * Lazy-loaded so the shell gzip budget stays intact.
 *
 * Preconditions: `me` is signed in and `familyId` is one of their families.
 * Postconditions: enabling asks for permission, stores a push subscription and sets the preference;
 * disabling clears the preference and removes the local browser subscription when present.
 *
 * @param props - Current account and open family.
 * @returns The preference block.
 */
export function BrowserNotificationsPanel(props: { readonly me: Me; readonly familyId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const preferences = useQuery({
    queryKey: ['notification-preferences', props.me.accountId],
    queryFn: () => api.listNotificationPreferences(),
  });

  const deadlinePref = preferences.data?.items.find(
    (item: NotificationPreference) => item.familyId === props.familyId && item.category === 'deadline',
  );
  const enabled = deadlinePref?.push === true;
  const pushConfigured = props.me.vapidPublicKey !== null;
  const permission = pushPermissionState();

  async function toggle(next: boolean): Promise<void> {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (next) {
        if (props.me.vapidPublicKey === null) {
          setError(m.browserNotificationsUnavailable());
          return;
        }
        await enableBrowserDeadlineAlerts({
          vapidPublicKey: props.me.vapidPublicKey,
          familyId: props.familyId,
          subscribe: (body) => api.createPushSubscription(crypto.randomUUID(), body),
          savePreference: (items) => api.updateNotificationPreferences({ items }),
        });
        setMessage(m.browserNotificationsEnabled());
      } else {
        await disableBrowserDeadlineAlerts({
          familyId: props.familyId,
          listPreferences: () => api.listNotificationPreferences(),
          savePreference: (items) => api.updateNotificationPreferences({ items }),
          deleteSubscription: (subscriptionId) => api.deletePushSubscription(subscriptionId),
        });
        setMessage(m.browserNotificationsDisabled());
      }
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences', props.me.accountId] });
    } catch (caught) {
      if (caught instanceof Error) {
        if (caught.message === 'denied') {
          setError(m.browserNotificationsBlocked());
          return;
        }
        if (caught.message === 'unsupported') {
          setError(m.browserNotificationsUnsupported());
          return;
        }
      }
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="account-browser-notifications">{m.browserNotificationsLabel()}</Label>
      <p className="text-[12px] text-muted-foreground">{m.browserNotificationsHelp()}</p>
      {!pushConfigured ? (
        <p className="text-[12px] text-muted-foreground">{m.browserNotificationsUnavailable()}</p>
      ) : null}
      {permission === 'denied' ? (
        <p className="text-[12px] text-muted-foreground">{m.browserNotificationsBlocked()}</p>
      ) : null}
      {permission === 'unsupported' ? (
        <p className="text-[12px] text-muted-foreground">{m.browserNotificationsUnsupported()}</p>
      ) : null}
      <Button
        id="account-browser-notifications"
        variant={enabled ? 'default' : 'outline'}
        disabled={pending || !pushConfigured || permission === 'denied' || permission === 'unsupported'}
        onClick={() => void toggle(!enabled)}
      >
        {enabled ? m.browserNotificationsTurnOff() : m.browserNotificationsTurnOn()}
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
      {message === null ? null : <p className="text-[12px] text-muted-foreground">{message}</p>}
    </div>
  );
}
