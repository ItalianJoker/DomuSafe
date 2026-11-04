import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { RescueCard, Resident } from '@domusafe/contracts';
import { limitFor, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { rescuePath } from '@/features/rescue/path.js';
import { problemText } from '@/lib/copy.js';
import { rescueQuery, residentsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import {
  BLOOD_OPTIONS,
  MOBILITY_OPTIONS,
  bloodLabel,
  linesToList,
  listToLines,
  mobilityLabel,
} from './model.js';
import { compressPhoto } from './photo.js';

interface MedicineDraft {
  name: string;
  location: string;
}
interface ContactDraft {
  displayName: string;
  phone: string;
  relationship: string;
  hasKeys: boolean;
}

const emptyMedicine = (): MedicineDraft => ({ name: '', location: '' });
const emptyContact = (): ContactDraft => ({ displayName: '', phone: '', relationship: '', hasKeys: false });

/**
 * Identity and rescue card of the people in the open house, plus the control that opens the full-screen view.
 *
 * Preconditions: the caller can read residents. Writes require a manager.
 * Postconditions: saving stores the identity and replaces the rescue card. The rescue control opens the full-screen view.
 * Data contract: the photo is an optional compressed image.
 *
 * @param props - Family, house, plan and whether the person may edit.
 * @returns The card tab.
 */
export function CardPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly plan: PlanTier;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const [selected, setSelected] = useState<string | null>(null);
  const residentId = selected ?? people.data?.[0]?.id ?? null;
  const rescue = useQuery({
    ...rescueQuery(api, props.familyId, residentId ?? ''),
    enabled: residentId !== null,
  });
  const resident = people.data?.find((item) => item.id === residentId);
  const limit = limitFor(props.plan, 'residents');
  const atLimit = limit !== null && (people.data?.length ?? 0) >= limit;

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['residents', props.familyId, props.houseId] });
    await queryClient.invalidateQueries({ queryKey: ['rescue-sheet', props.familyId, props.houseId] });
    if (residentId !== null) {
      await queryClient.invalidateQueries({ queryKey: ['rescue', props.familyId, residentId] });
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <Button size="emergency" asChild>
          <Link to={rescuePath(props.familyId, props.houseId)}>{m.rescueOpen()}</Link>
        </Button>
      </div>
      {props.canWrite && !atLimit ? (
        <CreatePerson
          familyId={props.familyId}
          houseId={props.houseId}
          onCreated={async (id) => {
            setSelected(id);
            await refresh();
          }}
        />
      ) : null}
      {atLimit && props.canWrite ? (
        <p className="text-[13px] text-muted-foreground">{m.personaleLimitOne()}</p>
      ) : null}
      {(people.data?.length ?? 0) > 1 ? (
        <Field label={m.personalePick()} htmlFor="personale-pick">
          <Select value={residentId ?? ''} onValueChange={setSelected}>
            <SelectTrigger id="personale-pick">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(people.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {resident !== undefined && rescue.data !== undefined ? (
        <PersonForm
          familyId={props.familyId}
          resident={resident}
          rescue={rescue.data}
          canWrite={props.canWrite && !resident.planLocked}
          onSaved={refresh}
        />
      ) : null}
      {!props.canWrite ? <p className="text-[13px] text-muted-foreground">{m.personaleReadOnly()}</p> : null}
    </div>
  );
}

function CreatePerson(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly onCreated: (id: string) => Promise<void>;
}) {
  const api = useApi();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    if (name.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await api.createResident(
        props.familyId,
        { displayName: name.trim(), kind: 'adult', houseIds: [props.houseId] },
        crypto.randomUUID(),
      );
      setName('');
      await props.onCreated(created.id);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={m.personaleName()} htmlFor="new-person-name" {...(error === null ? {} : { error })}>
        <Input id="new-person-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>
        {m.personaleAddPerson()}
      </Button>
    </form>
  );
}

function PersonForm(props: {
  readonly familyId: string;
  readonly resident: Resident;
  readonly rescue: RescueCard;
  readonly canWrite: boolean;
  readonly onSaved: () => Promise<void>;
}) {
  const api = useApi();
  const [name, setName] = useState(props.resident.displayName);
  const [year, setYear] = useState(props.resident.birthYear === null ? '' : String(props.resident.birthYear));
  const [bedroom, setBedroom] = useState(props.resident.usualBedroom ?? '');
  const [photo, setPhoto] = useState<string | null>(props.resident.photo);
  const [blood, setBlood] = useState(props.rescue.bloodGroup ?? 'none');
  const [mobility, setMobility] = useState(props.rescue.mobility ?? 'none');
  const [allergies, setAllergies] = useState(listToLines(props.rescue.allergies));
  const [conditions, setConditions] = useState(listToLines(props.rescue.conditions));
  const [devices, setDevices] = useState(listToLines(props.rescue.devices));
  const [medicines, setMedicines] = useState<MedicineDraft[]>(
    props.rescue.medicines.length === 0
      ? []
      : props.rescue.medicines.map((item) => ({ name: item.name, location: item.location })),
  );
  const [contacts, setContacts] = useState<ContactDraft[]>(
    props.rescue.contacts.map((item) => ({
      displayName: item.displayName,
      phone: item.phone ?? '',
      relationship: item.relationship ?? '',
      hasKeys: item.hasKeys,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setName(props.resident.displayName);
    setYear(props.resident.birthYear === null ? '' : String(props.resident.birthYear));
    setBedroom(props.resident.usualBedroom ?? '');
    setPhoto(props.resident.photo);
    setBlood(props.rescue.bloodGroup ?? 'none');
    setMobility(props.rescue.mobility ?? 'none');
    setAllergies(listToLines(props.rescue.allergies));
    setConditions(listToLines(props.rescue.conditions));
    setDevices(listToLines(props.rescue.devices));
    setMedicines(props.rescue.medicines.map((item) => ({ name: item.name, location: item.location })));
    setContacts(
      props.rescue.contacts.map((item) => ({
        displayName: item.displayName,
        phone: item.phone ?? '',
        relationship: item.relationship ?? '',
        hasKeys: item.hasKeys,
      })),
    );
  }, [props.resident, props.rescue]);

  async function save(): Promise<void> {
    if (name.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    const birthYear = year.trim() === '' ? null : Number(year);
    if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2100)) {
      setError(m.fieldRequired());
      return;
    }
    const medicineRows = medicines.filter((item) => item.name.trim() !== '' || item.location.trim() !== '');
    if (medicineRows.some((item) => item.name.trim() === '' || item.location.trim() === '')) {
      setError(m.fieldRequired());
      return;
    }
    const contactRows = contacts.filter(
      (item) => item.displayName.trim() !== '' || item.phone.trim() !== '' || item.relationship.trim() !== '',
    );
    if (contactRows.some((item) => item.displayName.trim() === '')) {
      setError(m.fieldRequired());
      return;
    }
    if (
      contactRows.some((item) => item.phone.trim() !== '' && !/^\+[1-9]\d{1,14}$/.test(item.phone.trim()))
    ) {
      setError(m.casaPhoneInvalid());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await api.updateResident(props.familyId, props.resident.id, props.resident.version, {
        displayName: name.trim(),
        birthYear,
        usualBedroom: bedroom.trim() === '' ? null : bedroom.trim(),
        photo,
      });
      await api.putRescue(props.familyId, props.resident.id, props.rescue.version, {
        bloodGroup: BLOOD_OPTIONS.find((option) => option === blood) ?? null,
        mobility: MOBILITY_OPTIONS.find((option) => option === mobility) ?? null,
        allergies: linesToList(allergies),
        conditions: linesToList(conditions),
        devices: linesToList(devices),
        medicines: medicineRows.map((item) => ({ name: item.name.trim(), location: item.location.trim() })),
        contacts: contactRows.map((item) => ({
          displayName: item.displayName.trim(),
          phone: item.phone.trim() === '' ? null : item.phone.trim(),
          relationship: item.relationship.trim() === '' ? null : item.relationship.trim(),
          hasKeys: item.hasKeys,
        })),
      });
      setSaved(true);
      await props.onSaved();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label={m.personaleName()} htmlFor="person-name">
        <Input
          id="person-name"
          value={name}
          disabled={!props.canWrite}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label={m.personaleBirthYear()} htmlFor="person-year">
        <Input
          id="person-year"
          inputMode="numeric"
          value={year}
          disabled={!props.canWrite}
          onChange={(event) => setYear(event.target.value)}
        />
      </Field>
      <Field label={m.personaleBedroom()} htmlFor="person-room">
        <Input
          id="person-room"
          value={bedroom}
          disabled={!props.canWrite}
          onChange={(event) => setBedroom(event.target.value)}
        />
      </Field>
      <Field label={m.personalePhoto()} htmlFor="person-photo">
        <Input
          id="person-photo"
          type="file"
          accept="image/*"
          disabled={!props.canWrite}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file === undefined) {
              return;
            }
            void compressPhoto(file).then((url) => {
              if (url !== null) {
                setPhoto(url);
              }
            });
          }}
        />
      </Field>
      {photo === null ? null : (
        <div className="flex items-center gap-3">
          <img src={photo} alt="" className="size-16 rounded-md object-cover" />
          {props.canWrite ? (
            <Button type="button" variant="outline" onClick={() => setPhoto(null)}>
              {m.personalePhotoRemove()}
            </Button>
          ) : null}
        </div>
      )}
      <Field label={m.personaleBlood()} htmlFor="person-blood">
        <Select value={blood} disabled={!props.canWrite} onValueChange={setBlood}>
          <SelectTrigger id="person-blood">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.personaleNotSet()}</SelectItem>
            {BLOOD_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {bloodLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={m.personaleMobility()} htmlFor="person-mobility">
        <Select value={mobility} disabled={!props.canWrite} onValueChange={setMobility}>
          <SelectTrigger id="person-mobility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.personaleNotSet()}</SelectItem>
            {MOBILITY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {mobilityLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={m.personaleAllergies()} htmlFor="person-allergies" hint={m.personaleLinesHint()}>
        <Textarea
          id="person-allergies"
          value={allergies}
          disabled={!props.canWrite}
          onChange={(event) => setAllergies(event.target.value)}
        />
      </Field>
      <Field label={m.personaleConditions()} htmlFor="person-conditions" hint={m.personaleLinesHint()}>
        <Textarea
          id="person-conditions"
          value={conditions}
          disabled={!props.canWrite}
          onChange={(event) => setConditions(event.target.value)}
        />
      </Field>
      <Field label={m.personaleDevices()} htmlFor="person-devices" hint={m.personaleLinesHint()}>
        <Textarea
          id="person-devices"
          value={devices}
          disabled={!props.canWrite}
          onChange={(event) => setDevices(event.target.value)}
        />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="text-[13px] font-medium">{m.personaleMedicines()}</legend>
        {medicines.map((item, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              aria-label={m.personaleMedicine()}
              value={item.name}
              disabled={!props.canWrite}
              placeholder={m.personaleMedicine()}
              onChange={(event) =>
                setMedicines((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
            />
            <Input
              aria-label={m.personaleWhere()}
              value={item.location}
              disabled={!props.canWrite}
              placeholder={m.personaleWhere()}
              onChange={(event) =>
                setMedicines((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, location: event.target.value } : row,
                  ),
                )
              }
            />
            {props.canWrite ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setMedicines((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                {m.personaleRemove()}
              </Button>
            ) : null}
          </div>
        ))}
        {props.canWrite ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setMedicines((rows) => [...rows, emptyMedicine()])}
          >
            {m.personaleAddMedicine()}
          </Button>
        ) : null}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-[13px] font-medium">{m.personaleContacts()}</legend>
        {contacts.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-md border border-border p-3">
            <Input
              aria-label={m.personaleName()}
              value={item.displayName}
              disabled={!props.canWrite}
              placeholder={m.personaleName()}
              onChange={(event) =>
                setContacts((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, displayName: event.target.value } : row,
                  ),
                )
              }
            />
            <Input
              aria-label={m.personaleNumber()}
              value={item.phone}
              disabled={!props.canWrite}
              placeholder={m.casaPhoneHint()}
              onChange={(event) =>
                setContacts((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, phone: event.target.value } : row,
                  ),
                )
              }
            />
            <Input
              aria-label={m.personaleRelation()}
              value={item.relationship}
              disabled={!props.canWrite}
              placeholder={m.personaleRelation()}
              onChange={(event) =>
                setContacts((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, relationship: event.target.value } : row,
                  ),
                )
              }
            />
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={item.hasKeys}
                disabled={!props.canWrite}
                onChange={(event) =>
                  setContacts((rows) =>
                    rows.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, hasKeys: event.target.checked } : row,
                    ),
                  )
                }
              />
              {m.personaleHasKeys()}
            </label>
            {props.canWrite ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setContacts((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                {m.personaleRemove()}
              </Button>
            ) : null}
          </div>
        ))}
        {props.canWrite ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setContacts((rows) => [...rows, emptyContact()])}
          >
            {m.personaleAddContact()}
          </Button>
        ) : null}
      </fieldset>
      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      {saved ? <p className="text-[13px] text-muted-foreground">{m.personaleSaved()}</p> : null}
      {props.canWrite ? (
        <Button type="submit" disabled={pending}>
          {m.personaleSave()}
        </Button>
      ) : null}
    </form>
  );
}
