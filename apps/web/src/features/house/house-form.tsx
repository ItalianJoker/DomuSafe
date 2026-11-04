import type { SubmitEvent } from 'react';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { issueText } from '@/lib/copy.js';
import type { FieldIssues, HouseFormValues } from '@/lib/fields.js';
import { m } from '@/paraglide/messages.js';

function note(issues: FieldIssues | null, field: string): { error: string } | Record<string, never> {
  const issue = issues?.[field];
  return issue === undefined ? {} : { error: issueText(issue) };
}

/**
 * Manual fields of a house: name and address.
 *
 * Preconditions: `values` are the current field strings.
 * Postconditions: `onSubmit` runs after the browser submit event is cancelled.
 * Data contract: address lines may be left blank; the country is two letters the person types.
 *
 * @param props - Values, issues and handlers.
 * @returns The form.
 */
export function HouseForm(props: {
  readonly idPrefix: string;
  readonly submitLabel: string;
  readonly values: HouseFormValues;
  readonly issues: FieldIssues | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly saved?: boolean;
  readonly onChange: (values: HouseFormValues) => void;
  readonly onSubmit: () => void;
}) {
  function change(patch: Partial<HouseFormValues>): void {
    props.onChange({ ...props.values, ...patch });
  }
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onSubmit();
  }
  const id = (name: string) => `${props.idPrefix}-${name}`;
  return (
    <form className="grid max-w-md gap-3" onSubmit={submit}>
      <Field htmlFor={id('name')} label={m.houseName()} {...note(props.issues, 'name')}>
        <Input
          id={id('name')}
          value={props.values.name}
          onChange={(event) => change({ name: event.target.value })}
        />
      </Field>
      <Field htmlFor={id('address')} label={m.address()} {...note(props.issues, 'addressLine')}>
        <Input
          id={id('address')}
          autoComplete="street-address"
          value={props.values.addressLine}
          onChange={(event) => change({ addressLine: event.target.value })}
        />
      </Field>
      <Field htmlFor={id('postal')} label={m.postalCode()} {...note(props.issues, 'postalCode')}>
        <Input
          id={id('postal')}
          autoComplete="postal-code"
          value={props.values.postalCode}
          onChange={(event) => change({ postalCode: event.target.value })}
        />
      </Field>
      <Field htmlFor={id('city')} label={m.city()} {...note(props.issues, 'city')}>
        <Input
          id={id('city')}
          autoComplete="address-level2"
          value={props.values.city}
          onChange={(event) => change({ city: event.target.value })}
        />
      </Field>
      <Field htmlFor={id('province')} label={m.province()} {...note(props.issues, 'province')}>
        <Input
          id={id('province')}
          autoComplete="address-level1"
          value={props.values.province}
          onChange={(event) => change({ province: event.target.value })}
        />
      </Field>
      <Field
        htmlFor={id('country')}
        label={m.country()}
        hint={m.countryHint()}
        {...note(props.issues, 'country')}
      >
        <Input
          id={id('country')}
          autoComplete="country"
          maxLength={2}
          value={props.values.country}
          onChange={(event) => change({ country: event.target.value.toUpperCase() })}
        />
      </Field>
      {props.error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {props.error}
        </p>
      )}
      {props.saved === true ? <p className="text-[12px] text-muted-foreground">{m.saved()}</p> : null}
      <Button type="submit" disabled={props.pending}>
        {props.submitLabel}
      </Button>
    </form>
  );
}
