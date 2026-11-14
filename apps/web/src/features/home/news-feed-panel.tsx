import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { NewsItem } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { problemText } from '@/lib/copy.js';
import { newsFeedQuery, newsFeedKey } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { resolveNoticePath } from '@/features/notifications/notification-inbox.js';

/**
 * Family-visible «Novità» feed on the house dashboard (product tips).
 *
 * Preconditions: the caller is signed in inside an open house.
 * Postconditions: marking as read only updates the account read cursor.
 * Data contract: titles and bodies come from the server catalogue; chrome copy is i18n.
 *
 * Lazy-loaded with the home chunk so the shell gzip budget stays intact.
 *
 * @param props - Open family and house for deep links.
 * @returns The news panel.
 */
export function NewsFeedPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly locale: 'it' | 'en';
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const feed = useQuery(newsFeedQuery(api, props.locale));
  const markRead = useMutation({
    mutationFn: () => api.markNewsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: newsFeedKey });
    },
  });

  const items = feed.data?.items ?? [];
  const unread = feed.data?.unreadCount ?? 0;

  return (
    <section className="grid max-w-xl gap-4" aria-labelledby="news-feed-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="news-feed-title" className="text-[15px] font-medium tracking-tight">
            {m.newsTitle()}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.newsLead()}</p>
        </div>
        {unread > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={markRead.isPending}
            onClick={() => {
              markRead.mutate();
            }}
          >
            {m.newsMarkRead()}
          </Button>
        ) : null}
      </header>

      {feed.isLoading ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {feed.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(feed.error)}
        </p>
      ) : null}
      {markRead.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(markRead.error)}
        </p>
      ) : null}

      {!feed.isLoading && !feed.isError && items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.newsEmpty()}</p>
      ) : null}

      <ul className="grid gap-3">
        {items.map((item) => (
          <NewsRow key={item.id} item={item} familyId={props.familyId} houseId={props.houseId} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One news row with optional deep link into the open house.
 *
 * @param props - Item and house context.
 * @returns A list entry.
 */
function NewsRow(props: { readonly item: NewsItem; readonly familyId: string; readonly houseId: string }) {
  const navigate = useNavigate();
  const path = resolveNoticePath(props.item.link, props.familyId, props.houseId);
  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-2">
        <p
          className={
            props.item.unread
              ? 'text-[13px] font-medium text-foreground'
              : 'text-[13px] font-medium text-muted-foreground'
          }
        >
          {props.item.title}
        </p>
        {props.item.unread ? <span className="text-[11px] text-primary">{m.newsUnread()}</span> : null}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{props.item.body}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{formatNewsDate(props.item.publishedAt)}</p>
    </>
  );

  if (path === null) {
    return <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">{body}</li>;
  }

  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        className="block w-full rounded-sm text-left outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          void navigate({ to: path });
        }}
      >
        {body}
        <span className="mt-1 inline-block text-[12px] text-primary">{m.newsOpen()}</span>
      </button>
    </li>
  );
}

/**
 * Formats a news publish instant for the feed list.
 *
 * @param iso - Instant from the API.
 * @returns A short localized date string.
 */
function formatNewsDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
