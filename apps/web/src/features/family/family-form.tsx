import { CURRENCIES } from '@domusafe/contracts';
import type { SubmitEvent } from 'react';
import { Field } from '@/components/shell/page.js';
import { Label } from '@/components/ui/label.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { issueText } from '@/lib/copy.js';
import type { FamilyFormValues, FieldIssues } from '@/lib/fields.js';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

/** Time zones offered as suggestions. The field still accepts any zone the person types. */
const TIME_ZONES = [
  'Europe/Rome',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/London',
  'Europe/Lisbon',
  'Atlantic/Canary',
  'America/New_York',
  'UTC',
] as const;

function note(issues: FieldIssues | null, field: string): { error: string } | Record<string, never> {
  const issue = issues?.[field];
  return issue === undefined ? {} : { error: issueText(issue) };
}

/**
 * Manual fields of a family: name, time zone, currency, language and, when creating, the first house.
 *
 * Preconditions: `values` are the current field strings.
 * Postconditions: `onSubmit` runs only after the browser submit event is cancelled.
 * Data contract: every field is visible and editable; defaults are prefilled, not hidden.
 *
 * @param props - Mode, values, issues and handlers.
 * @returns The form.
 */
export function FamilyForm(props: {
  readonly mode: 'create' | 'edit';
  readonly values: FamilyFormValues;
  readonly issues: FieldIssues | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly saved?: boolean;
  readonly onChange: (values: FamilyFormValues) => void;
  readonly onSubmit: () => void;
}) {
  const locale = getLocale();
  function change(patch: Partial<FamilyFormValues>): void {
    props.onChange({ ...props.values, ...patch });
  }
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onSubmit();
  }
  return (
    <form className="grid max-w-md gap-3" onSubmit={submit}>
      <Field htmlFor="family-name" label={m.familyName()} {...note(props.issues, 'name')}>
        <Input
          id="family-name"
          value={props.values.name}
          onChange={(event) => change({ name: event.target.value })}
        />
      </Field>
      <Field
        htmlFor="family-timezone"
        label={m.timezone()}
        hint={m.timezoneHint()}
        {...note(props.issues, 'timezone')}
      >
        <Input
          id="family-timezone"
          list="family-timezones"
          autoComplete="off"
          value={props.values.timezone}
          onChange={(event) => change({ timezone: event.target.value })}
        />
        <datalist id="family-timezones">
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-1.5">
        <Label htmlFor="family-currency">{m.currency()}</Label>
        <Select value={props.values.currency} onValueChange={(currency) => change({ currency })}>
          <SelectTrigger id="family-currency" aria-label={m.currency()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency.code} value={currency.code}>
                {locale === 'en' ? currency.nameEn : currency.nameIt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="family-locale">{m.language()}</Label>
        <Select value={props.values.locale} onValueChange={(next) => change({ locale: next })}>
          <SelectTrigger id="family-locale" aria-label={m.language()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="it">{m.languageItalian()}</SelectItem>
            <SelectItem value="en">{m.languageEnglish()}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {props.mode === 'create' ? (
        <Field htmlFor="first-house" label={m.firstHouseName()} {...note(props.issues, 'houseName')}>
          <Input
            id="first-house"
            value={props.values.houseName ?? ''}
            onChange={(event) => change({ houseName: event.target.value })}
          />
        </Field>
      ) : null}
      {props.error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {props.error}
        </p>
      )}
      {props.saved === true ? <p className="text-[12px] text-muted-foreground">{m.saved()}</p> : null}
      <Button type="submit" disabled={props.pending}>
        {props.mode === 'create' ? m.createFamilySubmit() : m.save()}
      </Button>
    </form>
  );
}
