import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { problemText } from '@/lib/copy.js';
import { phoneLinesQuery, residentsQuery, subscriptionsQuery, vehiclesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

/**
 * Mobile plan, personal subscriptions and vehicle deadlines of the selected person.
 *
 * Preconditions: the caller can read residents of the house.
 * Postconditions: each save is one manual record.
 * Data contract: dates are calendar dates.
 *
 * @param props - Family, house and whether the person may edit.
 * @returns The services tab.
 */
export function ServicesPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const resident = people.data?.[0];
  if (resident === undefined) {
    return <p className="text-[13px] text-muted-foreground">{m.personaleNone()}</p>;
  }
  return (
    <div className="grid max-w-xl gap-8">
      <PhoneBlock
        familyId={props.familyId}
        residentId={resident.id}
        canWrite={props.canWrite && !resident.planLocked}
      />
      <SubscriptionBlock
        familyId={props.familyId}
        residentId={resident.id}
        canWrite={props.canWrite && !resident.planLocked}
      />
      <VehicleBlock
        familyId={props.familyId}
        residentId={resident.id}
        canWrite={props.canWrite && !resident.planLocked}
      />
    </div>
  );
}

function PhoneBlock(props: {
  readonly familyId: string;
  readonly residentId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const lines = useQuery(phoneLinesQuery(api, props.familyId, props.residentId));
  const [operatorName, setOperatorName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [planName, setPlanName] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(): Promise<void> {
    if (operatorName.trim() === '' || planName.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber.trim())) {
      setError(m.casaPhoneInvalid());
      return;
    }
    setError(null);
    try {
      await api.createPhoneLine(
        props.familyId,
        props.residentId,
        {
          operatorName: operatorName.trim(),
          phoneNumber: phoneNumber.trim(),
          planName: planName.trim(),
          renewalDate: renewalDate === '' ? null : renewalDate,
        },
        crypto.randomUUID(),
      );
      setOperatorName('');
      setPhoneNumber('');
      setPlanName('');
      setRenewalDate('');
      await queryClient.invalidateQueries({
        queryKey: phoneLinesQuery(api, props.familyId, props.residentId).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.personaleMobile()}</h2>
      {(lines.data ?? []).map((line) => (
        <p key={line.id} className="text-[13px]">
          {line.operatorName} · {line.planName} · {line.phoneNumber}
          {line.renewalDate === null ? '' : ` · ${line.renewalDate}`}
        </p>
      ))}
      {props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personaleOperator()} htmlFor="phone-operator">
            <Input
              id="phone-operator"
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
            />
          </Field>
          <Field label={m.personalePlan()} htmlFor="phone-plan">
            <Input id="phone-plan" value={planName} onChange={(event) => setPlanName(event.target.value)} />
          </Field>
          <Field label={m.personaleNumber()} htmlFor="phone-number" hint={m.casaPhoneHint()}>
            <Input
              id="phone-number"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
          </Field>
          <Field label={m.personaleRenewal()} htmlFor="phone-renewal">
            <Input
              id="phone-renewal"
              type="date"
              value={renewalDate}
              onChange={(event) => setRenewalDate(event.target.value)}
            />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit">{m.personaleAdd()}</Button>
        </form>
      ) : null}
    </section>
  );
}

function SubscriptionBlock(props: {
  readonly familyId: string;
  readonly residentId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const items = useQuery(subscriptionsQuery(api, props.familyId, props.residentId));
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(): Promise<void> {
    if (name.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setError(null);
    try {
      await api.createSubscription(
        props.familyId,
        props.residentId,
        {
          name: name.trim(),
          providerName: provider.trim() === '' ? null : provider.trim(),
          renewalDate: renewalDate === '' ? null : renewalDate,
        },
        crypto.randomUUID(),
      );
      setName('');
      setProvider('');
      setRenewalDate('');
      await queryClient.invalidateQueries({
        queryKey: subscriptionsQuery(api, props.familyId, props.residentId).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.personaleSubscriptions()}</h2>
      {(items.data ?? []).map((item) => (
        <p key={item.id} className="text-[13px]">
          {item.name}
          {item.providerName === null ? '' : ` · ${item.providerName}`}
          {item.renewalDate === null ? '' : ` · ${item.renewalDate}`}
        </p>
      ))}
      {props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personaleSubscriptionName()} htmlFor="sub-name">
            <Input id="sub-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={m.personaleProvider()} htmlFor="sub-provider">
            <Input id="sub-provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
          </Field>
          <Field label={m.personaleRenewal()} htmlFor="sub-renewal">
            <Input
              id="sub-renewal"
              type="date"
              value={renewalDate}
              onChange={(event) => setRenewalDate(event.target.value)}
            />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit">{m.personaleAdd()}</Button>
        </form>
      ) : null}
    </section>
  );
}

function VehicleBlock(props: {
  readonly familyId: string;
  readonly residentId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const items = useQuery(vehiclesQuery(api, props.familyId, props.residentId));
  const [plate, setPlate] = useState('');
  const [insurance, setInsurance] = useState('');
  const [roadTax, setRoadTax] = useState('');
  const [inspection, setInspection] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(): Promise<void> {
    if (plate.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setError(null);
    try {
      await api.createVehicle(
        props.familyId,
        props.residentId,
        {
          plate: plate.trim(),
          insuranceRenewalDate: insurance === '' ? null : insurance,
          roadTaxDueDate: roadTax === '' ? null : roadTax,
          inspectionDueDate: inspection === '' ? null : inspection,
        },
        crypto.randomUUID(),
      );
      setPlate('');
      setInsurance('');
      setRoadTax('');
      setInspection('');
      await queryClient.invalidateQueries({
        queryKey: vehiclesQuery(api, props.familyId, props.residentId).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.personaleVehicles()}</h2>
      {(items.data ?? []).map((item) => (
        <p key={item.id} className="text-[13px]">
          {item.plate}
          {item.insuranceRenewalDate === null
            ? ''
            : ` · ${m.personaleInsurance()} ${item.insuranceRenewalDate}`}
          {item.roadTaxDueDate === null ? '' : ` · ${m.personaleRoadTax()} ${item.roadTaxDueDate}`}
          {item.inspectionDueDate === null ? '' : ` · ${m.personaleInspection()} ${item.inspectionDueDate}`}
        </p>
      ))}
      {props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personalePlate()} htmlFor="vehicle-plate">
            <Input id="vehicle-plate" value={plate} onChange={(event) => setPlate(event.target.value)} />
          </Field>
          <Field label={m.personaleInsurance()} htmlFor="vehicle-insurance">
            <Input
              id="vehicle-insurance"
              type="date"
              value={insurance}
              onChange={(event) => setInsurance(event.target.value)}
            />
          </Field>
          <Field label={m.personaleRoadTax()} htmlFor="vehicle-tax">
            <Input
              id="vehicle-tax"
              type="date"
              value={roadTax}
              onChange={(event) => setRoadTax(event.target.value)}
            />
          </Field>
          <Field label={m.personaleInspection()} htmlFor="vehicle-inspection">
            <Input
              id="vehicle-inspection"
              type="date"
              value={inspection}
              onChange={(event) => setInspection(event.target.value)}
            />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit">{m.personaleAdd()}</Button>
        </form>
      ) : null}
    </section>
  );
}
