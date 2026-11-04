import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { limitFor, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { petsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { SPECIES_OPTIONS, speciesLabel } from './model.js';

/**
 * Animals of the open house and the clinic to call.
 *
 * Preconditions: the caller can read pets.
 * Postconditions: a new animal is linked to this house and counts toward the plan limit.
 * Data contract: the phone, when set, is international.
 *
 * @param props - Family, house, plan and whether the person may edit.
 * @returns The animals tab.
 */
export function PetsPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly plan: PlanTier;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const pets = useQuery(petsQuery(api, props.familyId, props.houseId));
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<(typeof SPECIES_OPTIONS)[number]>('cat');
  const [vetName, setVetName] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [vetAddress, setVetAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const limit = limitFor(props.plan, 'pets');
  const atLimit = limit !== null && (pets.data?.length ?? 0) >= limit;

  async function add(): Promise<void> {
    if (name.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    if (vetPhone.trim() !== '' && !/^\+[1-9]\d{1,14}$/.test(vetPhone.trim())) {
      setError(m.casaPhoneInvalid());
      return;
    }
    setError(null);
    try {
      await api.createPet(
        props.familyId,
        {
          name: name.trim(),
          species,
          vetName: vetName.trim() === '' ? null : vetName.trim(),
          vetPhone: vetPhone.trim() === '' ? null : vetPhone.trim(),
          vetAddress: vetAddress.trim() === '' ? null : vetAddress.trim(),
          houseIds: [props.houseId],
        },
        crypto.randomUUID(),
      );
      setName('');
      setVetName('');
      setVetPhone('');
      setVetAddress('');
      await queryClient.invalidateQueries({
        queryKey: petsQuery(api, props.familyId, props.houseId).queryKey,
      });
      await queryClient.invalidateQueries({ queryKey: ['rescue-sheet', props.familyId, props.houseId] });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <div className="grid max-w-xl gap-4">
      {(pets.data ?? []).map((pet) => (
        <article key={pet.id} className="text-[13px]">
          <p className="font-medium">
            {pet.name} · {speciesLabel(pet.species)}
          </p>
          <p className="text-muted-foreground">
            {pet.vetName ?? m.personaleNotSet()}
            {pet.vetPhone === null ? '' : ` · ${pet.vetPhone}`}
          </p>
        </article>
      ))}
      {atLimit ? <p className="text-[13px] text-muted-foreground">{m.personalePetLimitOne()}</p> : null}
      {props.canWrite && !atLimit ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personalePetName()} htmlFor="pet-name">
            <Input id="pet-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={m.personaleSpecies()} htmlFor="pet-species">
            <Select value={species} onValueChange={(value) => setSpecies(value as typeof species)}>
              <SelectTrigger id="pet-species">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPECIES_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {speciesLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={m.personaleVet()} htmlFor="pet-vet">
            <Input id="pet-vet" value={vetName} onChange={(event) => setVetName(event.target.value)} />
          </Field>
          <Field label={m.personaleVetPhone()} htmlFor="pet-phone" hint={m.casaPhoneHint()}>
            <Input id="pet-phone" value={vetPhone} onChange={(event) => setVetPhone(event.target.value)} />
          </Field>
          <Field label={m.personaleVetAddress()} htmlFor="pet-address">
            <Input
              id="pet-address"
              value={vetAddress}
              onChange={(event) => setVetAddress(event.target.value)}
            />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit">{m.personaleAdd()}</Button>
        </form>
      ) : null}
    </div>
  );
}
