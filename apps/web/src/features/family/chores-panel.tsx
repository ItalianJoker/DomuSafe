import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Chore, ChoreCompletion, Resident, Reward } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import {
  choreCompletionsQuery,
  choresQuery,
  pointsQuery,
  residentsQuery,
  rewardsQuery,
} from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

async function readImageDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error('image');
  }
  if (file.size > 18_000) {
    throw new Error('size');
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || result.length > 24_576) {
        reject(new Error('size'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function statusLabel(status: ChoreCompletion['status']): string {
  switch (status) {
    case 'pending_approval':
      return m.choresStatusPending();
    case 'approved':
      return m.choresStatusApproved();
    case 'rejected':
      return m.choresStatusRejected();
  }
}

/**
 * Family chores schedule, points, streaks and rewards store under Famiglia.
 *
 * Preconditions: the caller can read rewards or complete chores.
 * Postconditions: completions may wait for parent approval; optional proof photo is a small image.
 * Data contract: points live in Postgres; no browser source of truth.
 *
 * @param props - Family, house and role capabilities.
 * @returns The panel.
 */
export function ChoresPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canManage: boolean;
  readonly canApprove: boolean;
  readonly canComplete: boolean;
  readonly canRead: boolean;
  readonly canRequest: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const residents = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const chores = useQuery({
    ...choresQuery(api, props.familyId, props.houseId),
    enabled: props.canComplete || props.canManage,
  });
  const pending = useQuery({
    ...choreCompletionsQuery(api, props.familyId, 'pending_approval'),
    enabled: props.canApprove || props.canRead,
  });
  const store = useQuery({
    ...rewardsQuery(api, props.familyId),
    enabled: props.canRead || props.canManage || props.canRequest,
  });

  const people = residents.data ?? [];
  const firstResident = people[0];
  const [residentId, setResidentId] = useState<string>('');
  const selectedResidentId = residentId !== '' ? residentId : (firstResident?.id ?? '');
  const points = useQuery({
    ...pointsQuery(api, props.familyId, selectedResidentId),
    enabled: props.canRead && selectedResidentId !== '',
  });

  const [title, setTitle] = useState('');
  const [pointsValue, setPointsValue] = useState('5');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState('10');
  const [proofByChore, setProofByChore] = useState<Record<string, string | null>>({});
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chores', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['chore-completions', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['rewards-store', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['points', props.familyId] }),
    ]);
  }

  async function addChore(): Promise<void> {
    if (title.trim() === '') {
      setError(m.choresNeedTitle());
      return;
    }
    const pointsNumber = Number.parseInt(pointsValue, 10);
    if (!Number.isFinite(pointsNumber) || pointsNumber < 0) {
      setError(m.choresNeedPoints());
      return;
    }
    setPendingAction(true);
    setError(null);
    try {
      await api.createChore(props.familyId, crypto.randomUUID(), {
        title: title.trim(),
        houseId: props.houseId,
        points: pointsNumber,
        requiresApproval,
        assignment: 'fixed',
        active: true,
        assignedResidentIds: selectedResidentId === '' ? [] : [selectedResidentId],
        nextDueDate: todayLocal(),
        rrule: 'FREQ=DAILY',
      });
      setTitle('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingAction(false);
    }
  }

  async function complete(chore: Chore): Promise<void> {
    if (selectedResidentId === '') {
      setError(m.choresNeedResident());
      return;
    }
    setPendingAction(true);
    setError(null);
    try {
      const proof = proofByChore[chore.id] ?? null;
      await api.completeChore(props.familyId, chore.id, crypto.randomUUID(), {
        residentId: selectedResidentId,
        dueDate: chore.nextDueDate ?? todayLocal(),
        ...(proof === null ? {} : { proofPhotoDataUrl: proof }),
      });
      setProofByChore((current) => ({ ...current, [chore.id]: null }));
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingAction(false);
    }
  }

  async function decide(completion: ChoreCompletion, approve: boolean): Promise<void> {
    setPendingAction(true);
    setError(null);
    try {
      if (approve) {
        await api.approveChoreCompletion(props.familyId, completion.id);
      } else {
        await api.rejectChoreCompletion(props.familyId, completion.id);
      }
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingAction(false);
    }
  }

  async function addReward(): Promise<void> {
    if (rewardTitle.trim() === '') {
      setError(m.rewardsNeedTitle());
      return;
    }
    const cost = Number.parseInt(rewardCost, 10);
    if (!Number.isFinite(cost) || cost < 1) {
      setError(m.rewardsNeedCost());
      return;
    }
    setPendingAction(true);
    setError(null);
    try {
      await api.createReward(props.familyId, crypto.randomUUID(), {
        title: rewardTitle.trim(),
        costPoints: cost,
        stock: null,
        active: true,
      });
      setRewardTitle('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingAction(false);
    }
  }

  async function requestReward(reward: Reward): Promise<void> {
    if (selectedResidentId === '') {
      setError(m.choresNeedResident());
      return;
    }
    setPendingAction(true);
    setError(null);
    try {
      await api.requestRewardRedemption(props.familyId, reward.id, crypto.randomUUID(), {
        residentId: selectedResidentId,
      });
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingAction(false);
    }
  }

  async function onProof(choreId: string, file: File | null): Promise<void> {
    if (file === null) {
      setProofByChore((current) => ({ ...current, [choreId]: null }));
      return;
    }
    try {
      const dataUrl = await readImageDataUrl(file);
      setProofByChore((current) => ({ ...current, [choreId]: dataUrl }));
      setError(null);
    } catch {
      setError(m.choresProofInvalid());
    }
  }

  function residentName(id: string): string {
    return people.find((person: Resident) => person.id === id)?.displayName ?? id;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[13px] font-medium">{m.choresTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.choresLead()}</p>
      </div>

      {people.length > 0 ? (
        <Field label={m.choresResident()} htmlFor="chores-resident">
          <Select value={selectedResidentId} onValueChange={setResidentId}>
            <SelectTrigger id="chores-resident">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <p className="text-[13px] text-muted-foreground">{m.choresNoResidents()}</p>
      )}

      {props.canRead && selectedResidentId !== '' ? (
        <div className="grid gap-1 text-[13px]">
          <p>
            {m.choresBalance({ points: String(points.data?.balance ?? '…') })}
            {' · '}
            {m.choresStreak({
              current: String(points.data?.streak.currentDays ?? '…'),
              best: String(points.data?.streak.bestDays ?? '…'),
            })}
          </p>
        </div>
      ) : null}

      {props.canManage ? (
        <div className="grid gap-3">
          <Field label={m.choresName()} htmlFor="chore-title">
            <Input
              id="chore-title"
              value={title}
              disabled={pendingAction}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label={m.choresPoints()} htmlFor="chore-points">
            <Input
              id="chore-points"
              inputMode="numeric"
              value={pointsValue}
              disabled={pendingAction}
              onChange={(event) => setPointsValue(event.target.value)}
            />
          </Field>
          <label className="flex min-h-12 items-center gap-3 text-[13px]">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={requiresApproval}
              disabled={pendingAction}
              onChange={(event) => setRequiresApproval(event.target.checked)}
            />
            {m.choresRequiresApproval()}
          </label>
          <Button size="emergency" disabled={pendingAction} onClick={() => void addChore()}>
            {m.choresAdd()}
          </Button>
        </div>
      ) : null}

      {chores.data === undefined && (props.canComplete || props.canManage) ? (
        <p className="text-[13px] text-muted-foreground">
          {chores.isError ? problemText(chores.error) : m.loading()}
        </p>
      ) : null}
      {chores.data?.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.choresNone()}</p>
      ) : null}
      {chores.data !== undefined && chores.data.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {chores.data.map((chore) => (
            <li key={chore.id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium">{chore.title}</p>
                <p className="text-[12px] text-muted-foreground">
                  {m.choresPointsValue({ points: String(chore.points) })}
                  {chore.nextDueDate === null ? '' : ` · ${chore.nextDueDate}`}
                </p>
              </div>
              {chore.description === null || chore.description === '' ? null : (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                  {chore.description}
                </p>
              )}
              {props.canComplete ? (
                <div className="grid gap-2">
                  <Field label={m.choresProof()} htmlFor={`proof-${chore.id}`}>
                    <Input
                      id={`proof-${chore.id}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={pendingAction}
                      onChange={(event) => void onProof(chore.id, event.target.files?.[0] ?? null)}
                    />
                  </Field>
                  <p className="text-[12px] text-muted-foreground">{m.choresProofHint()}</p>
                  <Button size="emergency" disabled={pendingAction} onClick={() => void complete(chore)}>
                    {m.choresComplete()}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {(props.canApprove || props.canRead) && pending.data !== undefined ? (
        <div className="grid gap-3">
          <h3 className="text-[13px] font-medium">{m.choresApprovalsTitle()}</h3>
          {pending.data.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{m.choresApprovalsNone()}</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {pending.data.map((item) => (
                <li key={item.id} className="grid gap-2 py-3">
                  <p className="text-[13px]">
                    {residentName(item.residentId)} · {item.dueDate} · {statusLabel(item.status)}
                  </p>
                  {item.note === null || item.note === '' ? null : (
                    <p className="text-[13px] text-muted-foreground">{item.note}</p>
                  )}
                  {item.proofPhotoDataUrl === null ? null : (
                    <img
                      src={item.proofPhotoDataUrl}
                      alt={m.choresProofAlt()}
                      className="max-h-40 w-auto rounded-md border border-border"
                    />
                  )}
                  {props.canApprove && item.status === 'pending_approval' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="emergency"
                        disabled={pendingAction}
                        onClick={() => void decide(item, true)}
                      >
                        {m.choresApprove()}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendingAction}
                        onClick={() => void decide(item, false)}
                      >
                        {m.choresReject()}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="grid gap-3">
        <div>
          <h3 className="text-[13px] font-medium">{m.rewardsTitle()}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.rewardsLead()}</p>
        </div>
        {props.canManage ? (
          <div className="grid gap-3">
            <Field label={m.rewardsName()} htmlFor="reward-title">
              <Input
                id="reward-title"
                value={rewardTitle}
                disabled={pendingAction}
                onChange={(event) => setRewardTitle(event.target.value)}
              />
            </Field>
            <Field label={m.rewardsCost()} htmlFor="reward-cost">
              <Input
                id="reward-cost"
                inputMode="numeric"
                value={rewardCost}
                disabled={pendingAction}
                onChange={(event) => setRewardCost(event.target.value)}
              />
            </Field>
            <Button size="emergency" disabled={pendingAction} onClick={() => void addReward()}>
              {m.rewardsAdd()}
            </Button>
          </div>
        ) : null}
        {store.data === undefined ? (
          <p className="text-[13px] text-muted-foreground">
            {store.isError ? problemText(store.error) : m.loading()}
          </p>
        ) : store.data.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.rewardsNone()}</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {store.data.map((reward) => (
              <li key={reward.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[13px] font-medium">{reward.title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {m.rewardsCostValue({ points: String(reward.costPoints) })}
                    {reward.stock === null ? '' : ` · ${m.rewardsStock({ count: String(reward.stock) })}`}
                  </p>
                </div>
                {props.canRequest ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingAction}
                    onClick={() => void requestReward(reward)}
                  >
                    {m.rewardsRequest()}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
