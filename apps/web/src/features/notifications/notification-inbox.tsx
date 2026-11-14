import type { Notification } from '@domusafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { problemText } from '@/lib/copy.js';
import { isSectionId, shellPath } from '@/lib/navigation.js';
import { notificationsKey, notificationsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { notificationCategoryLabel } from './category-label.js';

/**
 * Header control that opens the in-app notification inbox (deadline and system notices).
 * Lazy-loaded so the shell gzip budget stays intact.
 *
 * Preconditions: rendered inside the signed-in family shell with a known place.
 * Postconditions: marking read updates the server and the local list; opening a linked notice
 * navigates within the app when the path is internal.
 * Data contract: titles and bodies come from `GET /me/notifications`; no vault material.
 *
 * @param props - Open family and house for home navigation when a notice has no path.
 * @returns The bell control and panel.
 */
export function NotificationInbox(props: { readonly familyId: string; readonly houseId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inbox = useQuery({
    ...notificationsQuery(api, 30),
    enabled: true,
  });

  const items = inbox.data?.items ?? [];
  const unread = items.filter((item) => item.readAt === null).length;

  const markRead = useMutation({
    mutationFn: (notificationId: string) => api.markNotificationRead(notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openItem(item: Notification): Promise<void> {
    setError(null);
    try {
      if (item.readAt === null) {
        await markRead.mutateAsync(item.id);
      }
      setOpen(false);
      const target = resolveNoticePath(item.link, props.familyId, props.houseId);
      if (target !== null) {
        await navigate({ to: target });
      }
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  async function onMarkAll(): Promise<void> {
    setError(null);
    try {
      await markAll.mutateAsync();
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={m.notificationInboxLabel()}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="relative"
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden />
        ) : null}
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={m.notificationInboxTitle()}
          className="absolute top-full right-0 z-40 mt-1 flex w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-[13px] font-medium">{m.notificationInboxTitle()}</p>
            {unread > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={markAll.isPending}
                onClick={() => {
                  void onMarkAll();
                }}
              >
                {m.notificationMarkAllRead()}
              </Button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {inbox.isLoading ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">{m.notificationInboxLoading()}</p>
            ) : null}
            {inbox.isError ? (
              <p role="alert" className="px-3 py-4 text-[12px] text-destructive">
                {problemText(inbox.error)}
              </p>
            ) : null}
            {!inbox.isLoading && !inbox.isError && items.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">{m.notificationInboxEmpty()}</p>
            ) : null}
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      item.readAt === null
                        ? 'grid w-full gap-0.5 px-3 py-2.5 text-left hover:bg-accent'
                        : 'grid w-full gap-0.5 px-3 py-2.5 text-left opacity-70 hover:bg-accent'
                    }
                    onClick={() => {
                      void openItem(item);
                    }}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {notificationCategoryLabel(item.category)}
                    </span>
                    <span className="text-[13px] font-medium text-foreground">{item.title}</span>
                    <span className="line-clamp-2 text-[12px] text-muted-foreground">{item.body}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatNoticeTime(item.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {error === null ? null : (
            <p role="alert" className="border-t border-border px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Resolves an internal notice or news path into the open house shell.
 *
 * Accepts the house root (`/`), a full `/f/…` path, or a section shortcut
 * (`/casa`, `/famiglia`, …) that maps onto {@link shellPath}.
 *
 * @param link - Stored path, or null.
 * @param familyId - Open family.
 * @param houseId - Open house.
 * @returns A router path, or null when there is nowhere to go.
 */
export function resolveNoticePath(link: string | null, familyId: string, houseId: string): string | null {
  if (link === null || link === '/' || link === '') {
    return shellPath(familyId, houseId, 'home');
  }
  if (link.startsWith('/f/')) {
    return link;
  }
  if (link.startsWith('/')) {
    const segment = link.slice(1).split('/')[0] ?? '';
    if (segment === '') {
      return shellPath(familyId, houseId, 'home');
    }
    if (isSectionId(segment)) {
      return shellPath(familyId, houseId, segment);
    }
    return link;
  }
  return null;
}

/**
 * Formats a notice timestamp for the inbox list.
 *
 * @param iso - Instant from the API.
 * @returns A short localized date-time string.
 */
export function formatNoticeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
