import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { MEAL_SLOTS, type MealPlanEntry, type MealSlot, type Recipe } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { mealPlanQuery, recipesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

function startOfWeek(value: Date): Date {
  const day = value.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function slotLabel(slot: MealSlot): string {
  switch (slot) {
    case 'breakfast':
      return m.extraMealSlotBreakfast();
    case 'lunch':
      return m.extraMealSlotLunch();
    case 'dinner':
      return m.extraMealSlotDinner();
    case 'snack':
      return m.extraMealSlotSnack();
  }
}

function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return iso;
  }
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('it', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printWeek(args: {
  readonly from: string;
  readonly to: string;
  readonly entries: readonly MealPlanEntry[];
  readonly days: readonly string[];
}): void {
  const rows = args.days
    .map((day) => {
      const cells = MEAL_SLOTS.map((slot) => {
        const meals = args.entries.filter((entry) => entry.planDate === day && entry.slot === slot);
        const text =
          meals.length === 0
            ? '—'
            : meals
                .map((meal) => {
                  const title = meal.title ?? '—';
                  const servings =
                    meal.servings === null
                      ? ''
                      : ` (${m.extraMealServingsShort({ count: String(meal.servings) })})`;
                  return `${title}${servings}`;
                })
                .join('<br/>');
        return `<td>${text}</td>`;
      }).join('');
      return `<tr><th scope="row">${escapeHtml(formatDayLabel(day))}</th>${cells}</tr>`;
    })
    .join('');
  const headers = MEAL_SLOTS.map((slot) => `<th>${escapeHtml(slotLabel(slot))}</th>`).join('');
  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(m.extraMealPrintTitle({ from: args.from, to: args.to }))}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 13px; margin: 0 0 16px; color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #bbb; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f4f4f4; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(m.extraMealPrintTitle({ from: args.from, to: args.to }))}</h1>
  <p>${escapeHtml(m.extraMealPrintLead())}</p>
  <table>
    <thead><tr><th>${escapeHtml(m.extraMealDay())}</th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer,width=900,height=700');
  if (popup === null) {
    URL.revokeObjectURL(url);
    return;
  }
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/**
 * Weekly meal planner with manual edits and printable or PDF export via the browser print dialog.
 *
 * Preconditions: the caller can read kitchen recipes and the meal plan.
 * Postconditions: entries persist in Postgres; export opens a print window without adding shell weight.
 * Data contract: no browser source of truth.
 *
 * @param props - Family, open house and write capability.
 * @returns The panel.
 */
export function MealPlanPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => toIsoDate(addDays(weekStart, index))),
    [weekStart],
  );
  const from = days[0] ?? toIsoDate(weekStart);
  const to = days[6] ?? from;
  const plan = useQuery(mealPlanQuery(api, props.familyId, from, to, props.houseId));
  const recipes = useQuery(recipesQuery(api, props.familyId));

  const [planDate, setPlanDate] = useState(from);
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [title, setTitle] = useState('');
  const [recipeId, setRecipeId] = useState<string>('none');
  const [servings, setServings] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<MealPlanEntry | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['meal-plan', props.familyId] });
  }

  function clearForm(): void {
    setEditing(null);
    setTitle('');
    setRecipeId('none');
    setServings('');
    setNotes('');
    setPlanDate(from);
    setSlot('lunch');
  }

  function fillForm(entry: MealPlanEntry): void {
    setEditing(entry);
    setPlanDate(entry.planDate);
    setSlot(entry.slot);
    setTitle(entry.title ?? '');
    setRecipeId(entry.recipeId ?? 'none');
    setServings(entry.servings === null ? '' : String(entry.servings));
    setNotes(entry.notes ?? '');
    setError(null);
  }

  async function saveEntry(): Promise<void> {
    const servingsNumber = servings.trim() === '' ? null : Number.parseInt(servings, 10);
    if (servingsNumber !== null && (!Number.isFinite(servingsNumber) || servingsNumber < 1)) {
      setError(m.extraMealNeedServings());
      return;
    }
    const selectedRecipe: Recipe | undefined =
      recipeId === 'none' ? undefined : recipes.data?.find((recipe) => recipe.id === recipeId);
    const resolvedTitle = blank(title) ?? selectedRecipe?.title ?? null;
    if (resolvedTitle === null && recipeId === 'none') {
      setError(m.extraMealNeedTitle());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = {
        planDate,
        slot,
        houseId: props.houseId,
        recipeId: recipeId === 'none' ? null : recipeId,
        title: resolvedTitle,
        servings: servingsNumber,
        notes: blank(notes),
      };
      if (editing === null) {
        await api.createMealPlanEntry(props.familyId, crypto.randomUUID(), body);
      } else {
        await api.updateMealPlanEntry(props.familyId, editing.id, editing.version, body);
      }
      clearForm();
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function removeEntry(entry: MealPlanEntry): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.deleteMealPlanEntry(props.familyId, entry.id, entry.version);
      if (editing?.id === entry.id) {
        clearForm();
      }
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const entries = plan.data ?? [];

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[15px] font-medium">{m.extraMealTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraMealLead()}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="emergency"
          variant="outline"
          onClick={() => setWeekStart((current) => addDays(current, -7))}
        >
          {m.extraMealPrevWeek()}
        </Button>
        <p className="text-[15px] font-medium">{m.extraMealWeekRange({ from, to })}</p>
        <Button
          type="button"
          size="emergency"
          variant="outline"
          onClick={() => setWeekStart((current) => addDays(current, 7))}
        >
          {m.extraMealNextWeek()}
        </Button>
        <Button
          type="button"
          size="emergency"
          variant="outline"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          {m.extraMealThisWeek()}
        </Button>
        <Button type="button" size="emergency" onClick={() => printWeek({ from, to, entries, days })}>
          {m.extraMealPrint()}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-border px-2 py-2 font-medium">{m.extraMealDay()}</th>
              {MEAL_SLOTS.map((item) => (
                <th key={item} className="border-b border-border px-2 py-2 font-medium">
                  {slotLabel(item)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <th scope="row" className="border-b border-border px-2 py-3 align-top font-medium">
                  {formatDayLabel(day)}
                </th>
                {MEAL_SLOTS.map((item) => {
                  const cell = entries.filter((entry) => entry.planDate === day && entry.slot === item);
                  return (
                    <td key={`${day}-${item}`} className="border-b border-border px-2 py-3 align-top">
                      {cell.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="grid gap-2">
                          {cell.map((entry) => (
                            <li key={entry.id}>
                              <p className="font-medium">{entry.title ?? '—'}</p>
                              {entry.servings === null ? null : (
                                <p className="text-muted-foreground">
                                  {m.extraMealServingsShort({ count: String(entry.servings) })}
                                </p>
                              )}
                              {props.canWrite ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => fillForm(entry)}
                                  >
                                    {m.extraEdit()}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => void removeEntry(entry)}
                                  >
                                    {m.extraDelete()}
                                  </Button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {props.canWrite ? (
        <div className="grid gap-3">
          <h3 className="text-[13px] font-medium">
            {editing === null ? m.extraMealCreate() : m.extraMealEdit()}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={m.extraMealDate()} htmlFor="meal-date">
              <Input
                id="meal-date"
                className={touchControl}
                type="date"
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
              />
            </Field>
            <Field label={m.extraMealSlot()} htmlFor="meal-slot">
              <Select value={slot} onValueChange={(value) => setSlot(value as MealSlot)}>
                <SelectTrigger id="meal-slot" className={touchControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_SLOTS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {slotLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={m.extraMealRecipe()} htmlFor="meal-recipe">
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger id="meal-recipe" className={touchControl}>
                <SelectValue placeholder={m.extraMealRecipeNone()} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.extraMealRecipeNone()}</SelectItem>
                {(recipes.data ?? []).map((recipe) => (
                  <SelectItem key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={m.extraMealEntryTitle()} htmlFor="meal-title">
            <Input
              id="meal-title"
              className={touchControl}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={m.extraMealServings()} htmlFor="meal-servings">
              <Input
                id="meal-servings"
                className={touchControl}
                inputMode="numeric"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
              />
            </Field>
            <Field label={m.extraMealNotes()} htmlFor="meal-notes">
              <Input
                id="meal-notes"
                className={touchControl}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="emergency" disabled={pending} onClick={() => void saveEntry()}>
              {editing === null ? m.extraMealSave() : m.extraMealSaveEdit()}
            </Button>
            {editing === null ? null : (
              <Button type="button" size="emergency" variant="outline" disabled={pending} onClick={clearForm}>
                {m.extraCancel()}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{m.extraMealReadOnly()}</p>
      )}

      {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
      {plan.isLoading ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
    </div>
  );
}
