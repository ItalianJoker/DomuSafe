import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useId, useState, type ChangeEvent, type SubmitEvent } from 'react';
import type {
  InventoryFilterNode,
  InventoryItem,
  InventorySearchHit,
  InventorySearchResourceType,
  Room,
  RoomKind,
  SavedFilter,
  StorageUnit,
  StorageUnitKind,
  UpdateRoomRequest,
} from '@domusafe/contracts';
import { SAVED_FILTER_PIN_LIMIT } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import {
  inventoryFilterSearchQuery,
  inventoryItemsQuery,
  inventorySearchQuery,
  roomsQuery,
  savedFiltersQuery,
  storageUnitsQuery,
} from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { ROOM_KINDS, STORAGE_KINDS } from './model.js';

const RoomPhotosGallery = lazy(async () => {
  const module = await import('./room-photos-gallery.js');
  return { default: module.RoomPhotosGallery };
});

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

const ALL_SEARCH_TYPES: readonly InventorySearchResourceType[] = [
  'rooms',
  'storage_units',
  'inventory_items',
];

/**
 * Builds a nested inventory filter from the sidebar form fields.
 *
 * Preconditions: at least one of text, tags or types is present.
 * Postconditions: a single leaf or an AND/OR group with at most one nesting level of mixed leaves.
 *
 * @param input - Builder fields.
 * @returns Filter tree, or `null` when empty.
 */
function buildInventoryFilter(input: {
  readonly text: string;
  readonly tags: readonly string[];
  readonly tagMode: 'and' | 'or';
  readonly combine: 'and' | 'or';
  readonly types: readonly InventorySearchResourceType[];
}): InventoryFilterNode | null {
  const children: InventoryFilterNode[] = [];
  const text = input.text.trim();
  if (text.length > 0) {
    children.push({ kind: 'text', q: text });
  }
  if (input.tags.length > 0) {
    children.push({ kind: 'tags', tags: [...input.tags], mode: input.tagMode });
  }
  if (input.types.length > 0 && input.types.length < ALL_SEARCH_TYPES.length) {
    children.push({ kind: 'types', types: [...input.types] });
  }
  const first = children[0];
  if (first === undefined) {
    return null;
  }
  if (children.length === 1) {
    return first;
  }
  return { kind: 'group', op: input.combine, children };
}

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseTags(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 32);
}

function roomKindLabel(kind: RoomKind): string {
  switch (kind) {
    case 'kitchen':
      return m.casaRoomKitchen();
    case 'living':
      return m.casaRoomLiving();
    case 'bedroom':
      return m.casaRoomBedroom();
    case 'bathroom':
      return m.casaRoomBathroom();
    case 'office':
      return m.casaRoomOffice();
    case 'laundry':
      return m.casaRoomLaundry();
    case 'garage':
      return m.casaRoomGarage();
    case 'cellar':
      return m.casaRoomCellar();
    case 'attic':
      return m.casaRoomAttic();
    case 'garden':
      return m.casaRoomGarden();
    case 'balcony':
      return m.casaRoomBalcony();
    case 'other':
      return m.casaRoomOther();
  }
}

function storageKindLabel(kind: StorageUnitKind): string {
  switch (kind) {
    case 'furniture':
      return m.casaStorageFurniture();
    case 'wardrobe':
      return m.casaStorageWardrobe();
    case 'shelf':
      return m.casaStorageShelf();
    case 'drawer':
      return m.casaStorageDrawer();
    case 'box':
      return m.casaStorageBox();
    case 'container':
      return m.casaStorageContainer();
    case 'other':
      return m.casaStorageOther();
  }
}

function resourceLabel(hit: InventorySearchHit): string {
  switch (hit.resourceType) {
    case 'rooms':
      return m.casaInventoryHitRoom();
    case 'storage_units':
      return m.casaInventoryHitStorage();
    case 'inventory_items':
      return m.casaInventoryHitItem();
  }
}

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

/**
 * Hierarchical inventory of the open house: rooms, closets, items, nested AND/OR search
 * and up to five saved filters in the sidebar.
 *
 * Preconditions: the caller can read inventory. Writes need manager role.
 * Postconditions: edits persist through the inventory API with `If-Match`.
 * Data contract: photo and receipt are optional small image addresses; no browser source of truth.
 *
 * @param props - House and whether the person may edit.
 * @returns The inventory section.
 */
export function InventoryPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const rooms = useQuery(roomsQuery(api, props.familyId, props.houseId));
  const units = useQuery(storageUnitsQuery(api, props.familyId, props.houseId));
  const items = useQuery(inventoryItemsQuery(api, props.familyId, props.houseId));
  const saved = useQuery(savedFiltersQuery(api, props.familyId));
  const [search, setSearch] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterTags, setFilterTags] = useState('');
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and');
  const [combine, setCombine] = useState<'and' | 'or'>('and');
  const [types, setTypes] = useState<InventorySearchResourceType[]>([...ALL_SEARCH_TYPES]);
  const [activeFilter, setActiveFilter] = useState<InventoryFilterNode | null>(null);
  const [filterName, setFilterName] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deferredSearch = search.trim();
  const hits = useQuery({
    ...inventorySearchQuery(api, props.familyId, props.houseId, deferredSearch),
    enabled: deferredSearch.length > 0 && activeFilter === null,
  });
  const filterHits = useQuery({
    ...inventoryFilterSearchQuery(api, props.familyId, props.houseId, activeFilter),
    enabled: activeFilter !== null,
  });

  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: roomsQuery(api, props.familyId, props.houseId).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: storageUnitsQuery(api, props.familyId, props.houseId).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: inventoryItemsQuery(api, props.familyId, props.houseId).queryKey,
      }),
      queryClient.invalidateQueries({ queryKey: ['inventory-search', props.familyId, props.houseId] }),
      queryClient.invalidateQueries({
        queryKey: ['inventory-filter-search', props.familyId, props.houseId],
      }),
      queryClient.invalidateQueries({ queryKey: savedFiltersQuery(api, props.familyId).queryKey }),
    ]);
  }

  const roomList = rooms.data ?? [];
  const unitList = units.data ?? [];
  const itemList = items.data ?? [];
  const savedList = saved.data ?? [];
  const selectedRoomId = activeRoomId ?? roomList[0]?.id ?? null;
  const selectedRoom = roomList.find((room) => room.id === selectedRoomId) ?? null;
  const roomUnits = unitList.filter((unit) => unit.roomId === selectedRoomId);
  const roomItems = itemList.filter((item) => item.roomId === selectedRoomId);
  const resultHits = activeFilter !== null ? filterHits : hits;
  const showingResults = activeFilter !== null || deferredSearch.length > 0;

  function runBuiltFilter(): void {
    const built = buildInventoryFilter({
      text: filterText,
      tags: parseTags(filterTags),
      tagMode,
      combine,
      types,
    });
    if (built === null) {
      setFilterError(m.casaInventoryFilterNeedSomething());
      return;
    }
    setFilterError(null);
    setSearch('');
    setActiveFilter(built);
  }

  async function saveBuiltFilter(): Promise<void> {
    const built = buildInventoryFilter({
      text: filterText,
      tags: parseTags(filterTags),
      tagMode,
      combine,
      types,
    });
    const name = filterName.trim();
    if (built === null) {
      setFilterError(m.casaInventoryFilterNeedSomething());
      return;
    }
    if (name.length === 0) {
      setFilterError(m.casaInventorySaveFilterName());
      return;
    }
    if (savedList.length >= SAVED_FILTER_PIN_LIMIT) {
      setFilterError(m.casaInventorySavedFull());
      return;
    }
    setBusy(true);
    setFilterError(null);
    try {
      await api.createSavedFilter(props.familyId, { name, filter: built }, crypto.randomUUID());
      setFilterName('');
      await refresh();
    } catch (error) {
      setFilterError(problemText(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeSaved(filter: SavedFilter): Promise<void> {
    setBusy(true);
    setFilterError(null);
    try {
      await api.deleteSavedFilter(props.familyId, filter.id, filter.version);
      setActiveFilter(null);
      await refresh();
    } catch (error) {
      setFilterError(problemText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,42rem)]">
      <aside className="grid h-fit gap-3 border-b border-border pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <div>
          <p className="text-[14px] font-medium">{m.casaInventorySavedFilters()}</p>
          <p className="text-[12px] text-muted-foreground">{m.casaInventorySavedFiltersLead()}</p>
        </div>
        {saved.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
        {saved.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {problemText(saved.error)}
          </p>
        ) : null}
        {savedList.length === 0 && !saved.isPending ? (
          <p className="text-[13px] text-muted-foreground">{m.casaInventorySavedEmpty()}</p>
        ) : null}
        <ul className="grid gap-2">
          {savedList.map((filter) => (
            <li key={filter.id} className="grid gap-1">
              <button
                type="button"
                className="min-h-12 rounded-md border border-border px-3 text-left text-[14px] hover:bg-muted"
                onClick={() => {
                  setSearch('');
                  setActiveFilter(filter.filter);
                }}
              >
                {filter.name}
              </button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-12 justify-start px-3"
                disabled={busy}
                onClick={() => void removeSaved(filter)}
              >
                {m.casaInventoryRemoveFilter()}
              </Button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="grid max-w-2xl gap-8">
        {!props.canWrite ? <p className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</p> : null}
        <p className="text-[13px] text-muted-foreground">{m.casaInventoryLead()}</p>

        <section className="grid gap-3" aria-label={m.casaInventorySearch()}>
          <Field htmlFor="inv-field-1" label={m.casaInventorySearch()}>
            {' '}
            <Input
              id="inv-field-1"
              className={touchControl}
              value={search}
              onChange={(event) => {
                setActiveFilter(null);
                setSearch(event.target.value);
              }}
              placeholder={m.casaInventorySearchHint()}
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-3 border-t border-border pt-3" aria-label={m.casaInventoryFilterBuilder()}>
            <p className="text-[14px] font-medium">{m.casaInventoryFilterBuilder()}</p>
            <Field htmlFor="inv-filter-text" label={m.casaInventoryFilterText()}>
              <Input
                id="inv-filter-text"
                className={touchControl}
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field htmlFor="inv-filter-tags" label={m.casaInventoryFilterTags()}>
              <Input
                id="inv-filter-tags"
                className={touchControl}
                value={filterTags}
                onChange={(event) => setFilterTags(event.target.value)}
                placeholder={m.casaInventoryTagsHint()}
                autoComplete="off"
              />
            </Field>
            <Field htmlFor="inv-filter-tag-mode" label={m.casaInventoryFilterTagMode()}>
              <select
                id="inv-filter-tag-mode"
                className={touchControl}
                value={tagMode}
                onChange={(event) => setTagMode(event.target.value as 'and' | 'or')}
              >
                <option value="and">{m.casaInventoryFilterTagAnd()}</option>
                <option value="or">{m.casaInventoryFilterTagOr()}</option>
              </select>
            </Field>
            <Field htmlFor="inv-filter-combine" label={m.casaInventoryFilterCombine()}>
              <select
                id="inv-filter-combine"
                className={touchControl}
                value={combine}
                onChange={(event) => setCombine(event.target.value as 'and' | 'or')}
              >
                <option value="and">{m.casaInventoryFilterCombineAnd()}</option>
                <option value="or">{m.casaInventoryFilterCombineOr()}</option>
              </select>
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-[13px] text-muted-foreground">{m.casaInventoryFilterTypes()}</legend>
              {ALL_SEARCH_TYPES.map((type) => (
                <label key={type} className="flex min-h-12 items-center gap-3 text-[14px]">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={types.includes(type)}
                    onChange={(event) => {
                      setTypes((current) =>
                        event.target.checked ? [...current, type] : current.filter((item) => item !== type),
                      );
                    }}
                  />
                  {type === 'rooms'
                    ? m.casaInventoryHitRoom()
                    : type === 'storage_units'
                      ? m.casaInventoryHitStorage()
                      : m.casaInventoryHitItem()}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-12" onClick={runBuiltFilter}>
                {m.casaInventoryFilterRun()}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                onClick={() => {
                  setActiveFilter(null);
                  setFilterError(null);
                }}
              >
                {m.casaInventoryFilterClear()}
              </Button>
            </div>
            <Field htmlFor="inv-filter-name" label={m.casaInventorySaveFilterName()}>
              <Input
                id="inv-filter-name"
                className={touchControl}
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              className="min-h-12"
              disabled={busy || savedList.length >= SAVED_FILTER_PIN_LIMIT}
              onClick={() => void saveBuiltFilter()}
            >
              {m.casaInventorySaveFilter()}
            </Button>
            {filterError !== null ? (
              <p role="alert" className="text-[13px] text-destructive">
                {filterError}
              </p>
            ) : null}
          </div>

          {showingResults ? (
            <div className="grid gap-2">
              {resultHits.isPending ? (
                <p className="text-[13px] text-muted-foreground">{m.loading()}</p>
              ) : null}
              {resultHits.isError ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {problemText(resultHits.error)}
                </p>
              ) : null}
              {resultHits.data?.items.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{m.casaInventoryNoHits()}</p>
              ) : null}
              {resultHits.data?.items.map((hit) => (
                <div key={`${hit.resourceType}:${hit.resourceId}`} className="border-b border-border py-2">
                  <p className="text-[12px] text-muted-foreground">{resourceLabel(hit)}</p>
                  <p className="text-[14px] font-medium">{hit.title}</p>
                  {hit.body.trim() === '' ? null : (
                    <p className="text-[13px] text-muted-foreground">{hit.body.slice(0, 160)}</p>
                  )}
                  {hit.tags.length === 0 ? null : (
                    <p className="text-[12px] text-muted-foreground">{hit.tags.join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {(rooms.isPending || units.isPending || items.isPending) && !showingResults ? (
          <p className="text-[13px] text-muted-foreground">{m.loading()}</p>
        ) : null}
        {rooms.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {problemText(rooms.error)}
          </p>
        ) : null}

        {showingResults ? null : (
          <>
            <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
              <RoomPhotosGallery
                rooms={roomList}
                canWrite={props.canWrite}
                onUpdateRoom={async (room, patch) => {
                  await api.updateRoom(props.familyId, props.houseId, room.id, room.version, patch);
                  await refresh();
                }}
              />
            </Suspense>

            {props.canWrite ? (
              <RoomForm
                onSave={async (input) => {
                  await api.createRoom(
                    props.familyId,
                    props.houseId,
                    { ...input, sortOrder: 0 },
                    crypto.randomUUID(),
                  );
                  await refresh();
                }}
              />
            ) : null}

            {roomList.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.casaInventoryEmpty()}</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="tablist" aria-label={m.casaInventoryRooms()}>
                {roomList.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    role="tab"
                    aria-selected={room.id === selectedRoomId}
                    className={
                      room.id === selectedRoomId
                        ? 'min-h-12 rounded-md border border-foreground bg-muted px-3 text-[14px]'
                        : 'min-h-12 rounded-md border border-border px-3 text-[14px] text-muted-foreground'
                    }
                    onClick={() => setActiveRoomId(room.id)}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            )}

            {selectedRoom === null ? null : (
              <RoomDetail
                room={selectedRoom}
                units={roomUnits}
                items={roomItems}
                canWrite={props.canWrite}
                onRefresh={refresh}
                onUpdateRoom={async (patch) => {
                  await api.updateRoom(
                    props.familyId,
                    props.houseId,
                    selectedRoom.id,
                    selectedRoom.version,
                    patch,
                  );
                  await refresh();
                }}
                onDeleteRoom={async () => {
                  await api.deleteRoom(props.familyId, props.houseId, selectedRoom.id, selectedRoom.version);
                  setActiveRoomId(null);
                  await refresh();
                }}
                onCreateUnit={async (input) => {
                  await api.createStorageUnit(
                    props.familyId,
                    props.houseId,
                    { ...input, roomId: selectedRoom.id, sortOrder: 0 },
                    crypto.randomUUID(),
                  );
                  await refresh();
                }}
                onDeleteUnit={async (unit) => {
                  await api.deleteStorageUnit(props.familyId, props.houseId, unit.id, unit.version);
                  await refresh();
                }}
                onCreateItem={async (input) => {
                  await api.createInventoryItem(
                    props.familyId,
                    props.houseId,
                    { ...input, roomId: selectedRoom.id, quantity: 1 },
                    crypto.randomUUID(),
                  );
                  await refresh();
                }}
                onUpdateItem={async (item, patch) => {
                  await api.updateInventoryItem(props.familyId, props.houseId, item.id, item.version, patch);
                  await refresh();
                }}
                onDeleteItem={async (item) => {
                  await api.deleteInventoryItem(props.familyId, props.houseId, item.id, item.version);
                  await refresh();
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RoomForm(props: {
  readonly onSave: (input: { name: string; kind: RoomKind; notes: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoomKind>('other');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim() === '') {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await props.onSave({ name: name.trim(), kind, notes: blank(notes) });
      setName('');
      setNotes('');
      setKind('other');
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3 border-b border-border pb-6" onSubmit={(event) => void submit(event)}>
      <h3 className="text-[14px] font-medium">{m.casaInventoryAddRoom()}</h3>
      <Field htmlFor="inv-field-2" label={m.casaInventoryRoomName()}>
        {' '}
        <Input
          id="inv-field-2"
          className={touchControl}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field htmlFor="inv-field-3" label={m.casaInventoryRoomKind()}>
        {' '}
        <select
          id="inv-field-3"
          className={touchControl}
          value={kind}
          onChange={(event) => setKind(event.target.value as RoomKind)}
        >
          {ROOM_KINDS.map((value) => (
            <option key={value} value={value}>
              {roomKindLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="inv-field-4" label={m.casaNotes()}>
        {' '}
        <Textarea
          id="inv-field-4"
          className="min-h-20 text-[15px]"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="min-h-12 w-fit" disabled={pending || name.trim() === ''}>
        {m.casaInventorySaveRoom()}
      </Button>
    </form>
  );
}

function RoomDetail(props: {
  readonly room: Room;
  readonly units: readonly StorageUnit[];
  readonly items: readonly InventoryItem[];
  readonly canWrite: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onUpdateRoom: (patch: UpdateRoomRequest) => Promise<void>;
  readonly onDeleteRoom: () => Promise<void>;
  readonly onCreateUnit: (input: {
    name: string;
    kind: StorageUnitKind;
    parentId: string | null;
    notes: string | null;
  }) => Promise<void>;
  readonly onDeleteUnit: (unit: StorageUnit) => Promise<void>;
  readonly onCreateItem: (input: {
    name: string;
    storageUnitId: string | null;
    tags: string[];
    notes: string | null;
    warrantyUntil: string | null;
    warrantyNotes: string | null;
    photoCaption: string | null;
    photoDataUrl: string | null;
    receiptCaption: string | null;
    receiptDataUrl: string | null;
  }) => Promise<void>;
  readonly onUpdateItem: (
    item: InventoryItem,
    patch: {
      name?: string;
      tags?: string[];
      notes?: string | null;
      warrantyUntil?: string | null;
      warrantyNotes?: string | null;
      photoCaption?: string | null;
      photoDataUrl?: string | null;
      receiptCaption?: string | null;
      receiptDataUrl?: string | null;
      storageUnitId?: string | null;
    },
  ) => Promise<void>;
  readonly onDeleteItem: (item: InventoryItem) => Promise<void>;
}) {
  const [name, setName] = useState(props.room.name);
  const [kind, setKind] = useState<RoomKind>(props.room.kind);
  const [notes, setNotes] = useState(props.room.notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(props.room.name);
    setKind(props.room.kind);
    setNotes(props.room.notes ?? '');
  }, [props.room]);

  async function saveRoom(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await props.onUpdateRoom({ name: name.trim(), kind, notes: blank(notes) });
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-8">
      {props.canWrite ? (
        <form className="grid gap-3" onSubmit={(event) => void saveRoom(event)}>
          <h3 className="text-[15px] font-medium">{props.room.name}</h3>
          <Field htmlFor="inv-field-5" label={m.casaInventoryRoomName()}>
            {' '}
            <Input
              id="inv-field-5"
              className={touchControl}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field htmlFor="inv-field-6" label={m.casaInventoryRoomKind()}>
            {' '}
            <select
              id="inv-field-6"
              className={touchControl}
              value={kind}
              onChange={(event) => setKind(event.target.value as RoomKind)}
            >
              {ROOM_KINDS.map((value) => (
                <option key={value} value={value}>
                  {roomKindLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="inv-field-7" label={m.casaNotes()}>
            {' '}
            <Textarea
              id="inv-field-7"
              className="min-h-20 text-[15px]"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {error === null ? null : (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-12" disabled={pending}>
              {m.personaleSave()}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12"
              disabled={pending}
              onClick={() =>
                void props.onDeleteRoom().catch((cause: unknown) => setError(problemText(cause)))
              }
            >
              {m.casaDelete()}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <h3 className="text-[15px] font-medium">{props.room.name}</h3>
          <p className="text-[13px] text-muted-foreground">{roomKindLabel(props.room.kind)}</p>
        </div>
      )}

      <section className="grid gap-4">
        <h4 className="text-[14px] font-medium">{m.casaInventoryStorage()}</h4>
        {props.units.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.casaInventoryNoStorage()}</p>
        ) : (
          <ul className="grid gap-2">
            {props.units.map((unit) => (
              <li
                key={unit.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2"
              >
                <div>
                  <p className="text-[14px]">{unit.name}</p>
                  <p className="text-[12px] text-muted-foreground">{storageKindLabel(unit.kind)}</p>
                </div>
                {props.canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12"
                    onClick={() => void props.onDeleteUnit(unit)}
                  >
                    {m.casaDelete()}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {props.canWrite ? (
          <StorageForm
            units={props.units}
            onSave={async (input) => {
              await props.onCreateUnit(input);
              await props.onRefresh();
            }}
          />
        ) : null}
      </section>

      <section className="grid gap-4">
        <h4 className="text-[14px] font-medium">{m.casaInventoryItems()}</h4>
        {props.items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.casaInventoryNoItems()}</p>
        ) : (
          <ul className="grid gap-4">
            {props.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                units={props.units}
                canWrite={props.canWrite}
                onSave={(patch) => props.onUpdateItem(item, patch)}
                onDelete={() => props.onDeleteItem(item)}
              />
            ))}
          </ul>
        )}
        {props.canWrite ? <ItemForm units={props.units} onSave={props.onCreateItem} /> : null}
      </section>
    </div>
  );
}

function StorageForm(props: {
  readonly units: readonly StorageUnit[];
  readonly onSave: (input: {
    name: string;
    kind: StorageUnitKind;
    parentId: string | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StorageUnitKind>('wardrobe');
  const [parentId, setParentId] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim() === '') {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await props.onSave({
        name: name.trim(),
        kind,
        parentId: parentId === '' ? null : parentId,
        notes: blank(notes),
      });
      setName('');
      setNotes('');
      setParentId('');
      setKind('wardrobe');
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <Field htmlFor="inv-field-8" label={m.casaInventoryStorageName()}>
        {' '}
        <Input
          id="inv-field-8"
          className={touchControl}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field htmlFor="inv-field-9" label={m.casaInventoryStorageKind()}>
        {' '}
        <select
          id="inv-field-9"
          className={touchControl}
          value={kind}
          onChange={(event) => setKind(event.target.value as StorageUnitKind)}
        >
          {STORAGE_KINDS.map((value) => (
            <option key={value} value={value}>
              {storageKindLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="inv-field-10" label={m.casaInventoryParentStorage()}>
        {' '}
        <select
          id="inv-field-10"
          className={touchControl}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">{m.casaInventoryNoParent()}</option>
          {props.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="inv-field-11" label={m.casaNotes()}>
        {' '}
        <Textarea
          id="inv-field-11"
          className="min-h-16 text-[15px]"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="min-h-12 w-fit" disabled={pending || name.trim() === ''}>
        {m.casaInventorySaveStorage()}
      </Button>
    </form>
  );
}

function ItemForm(props: {
  readonly units: readonly StorageUnit[];
  readonly onSave: (input: {
    name: string;
    storageUnitId: string | null;
    tags: string[];
    notes: string | null;
    warrantyUntil: string | null;
    warrantyNotes: string | null;
    photoCaption: string | null;
    photoDataUrl: string | null;
    receiptCaption: string | null;
    receiptDataUrl: string | null;
  }) => Promise<void>;
}) {
  return (
    <ItemEditor
      units={props.units}
      initial={{
        name: '',
        storageUnitId: '',
        tags: '',
        notes: '',
        warrantyUntil: '',
        warrantyNotes: '',
        photoCaption: '',
        photoDataUrl: null,
        receiptCaption: '',
        receiptDataUrl: null,
      }}
      submitLabel={m.casaInventorySaveItem()}
      onSave={async (input) => {
        await props.onSave(input);
      }}
    />
  );
}

function ItemCard(props: {
  readonly item: InventoryItem;
  readonly units: readonly StorageUnit[];
  readonly canWrite: boolean;
  readonly onSave: (patch: {
    name?: string;
    tags?: string[];
    notes?: string | null;
    warrantyUntil?: string | null;
    warrantyNotes?: string | null;
    photoCaption?: string | null;
    photoDataUrl?: string | null;
    receiptCaption?: string | null;
    receiptDataUrl?: string | null;
    storageUnitId?: string | null;
  }) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}) {
  if (!props.canWrite) {
    return (
      <li className="border-b border-border py-3">
        <p className="text-[14px] font-medium">{props.item.name}</p>
        {props.item.tags.length === 0 ? null : (
          <p className="text-[12px] text-muted-foreground">{props.item.tags.join(' · ')}</p>
        )}
        {props.item.warrantyUntil === null ? null : (
          <p className="text-[13px] text-muted-foreground">
            {m.casaInventoryWarrantyUntil()}: {props.item.warrantyUntil}
          </p>
        )}
      </li>
    );
  }
  return (
    <li className="border-b border-border py-3">
      <ItemEditor
        units={props.units}
        initial={{
          name: props.item.name,
          storageUnitId: props.item.storageUnitId ?? '',
          tags: props.item.tags.join(', '),
          notes: props.item.notes ?? '',
          warrantyUntil: props.item.warrantyUntil ?? '',
          warrantyNotes: props.item.warrantyNotes ?? '',
          photoCaption: props.item.photoCaption ?? '',
          photoDataUrl: props.item.photoDataUrl,
          receiptCaption: props.item.receiptCaption ?? '',
          receiptDataUrl: props.item.receiptDataUrl,
        }}
        submitLabel={m.personaleSave()}
        onSave={props.onSave}
        onDelete={props.onDelete}
      />
    </li>
  );
}

function ItemEditor(props: {
  readonly units: readonly StorageUnit[];
  readonly initial: {
    name: string;
    storageUnitId: string;
    tags: string;
    notes: string;
    warrantyUntil: string;
    warrantyNotes: string;
    photoCaption: string;
    photoDataUrl: string | null;
    receiptCaption: string;
    receiptDataUrl: string | null;
  };
  readonly submitLabel: string;
  readonly onSave: (input: {
    name: string;
    storageUnitId: string | null;
    tags: string[];
    notes: string | null;
    warrantyUntil: string | null;
    warrantyNotes: string | null;
    photoCaption: string | null;
    photoDataUrl: string | null;
    receiptCaption: string | null;
    receiptDataUrl: string | null;
  }) => Promise<void>;
  readonly onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(props.initial.name);
  const [storageUnitId, setStorageUnitId] = useState(props.initial.storageUnitId);
  const [tags, setTags] = useState(props.initial.tags);
  const [notes, setNotes] = useState(props.initial.notes);
  const [warrantyUntil, setWarrantyUntil] = useState(props.initial.warrantyUntil);
  const [warrantyNotes, setWarrantyNotes] = useState(props.initial.warrantyNotes);
  const [photoCaption, setPhotoCaption] = useState(props.initial.photoCaption);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(props.initial.photoDataUrl);
  const [receiptCaption, setReceiptCaption] = useState(props.initial.receiptCaption);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(props.initial.receiptDataUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  useEffect(() => {
    setName(props.initial.name);
    setStorageUnitId(props.initial.storageUnitId);
    setTags(props.initial.tags);
    setNotes(props.initial.notes);
    setWarrantyUntil(props.initial.warrantyUntil);
    setWarrantyNotes(props.initial.warrantyNotes);
    setPhotoCaption(props.initial.photoCaption);
    setPhotoDataUrl(props.initial.photoDataUrl);
    setReceiptCaption(props.initial.receiptCaption);
    setReceiptDataUrl(props.initial.receiptDataUrl);
  }, [props.initial]);

  async function onFile(event: ChangeEvent<HTMLInputElement>, kind: 'photo' | 'receipt'): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    try {
      const dataUrl = await readImageDataUrl(file);
      if (kind === 'photo') {
        setPhotoDataUrl(dataUrl);
      } else {
        setReceiptDataUrl(dataUrl);
      }
      setError(null);
    } catch {
      setError(m.casaInventoryImageInvalid());
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim() === '') {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await props.onSave({
        name: name.trim(),
        storageUnitId: storageUnitId === '' ? null : storageUnitId,
        tags: parseTags(tags),
        notes: blank(notes),
        warrantyUntil: blank(warrantyUntil),
        warrantyNotes: blank(warrantyNotes),
        photoCaption: blank(photoCaption),
        photoDataUrl,
        receiptCaption: blank(receiptCaption),
        receiptDataUrl,
      });
      if (props.onDelete === undefined) {
        setName('');
        setStorageUnitId('');
        setTags('');
        setNotes('');
        setWarrantyUntil('');
        setWarrantyNotes('');
        setPhotoCaption('');
        setPhotoDataUrl(null);
        setReceiptCaption('');
        setReceiptDataUrl(null);
      }
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <Field htmlFor={`${fieldId}-name`} label={m.casaInventoryItemName()}>
        {' '}
        <Input
          id={`${fieldId}-name`}
          className={touchControl}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field htmlFor={`${fieldId}-storage`} label={m.casaInventoryItemStorage()}>
        {' '}
        <select
          id={`${fieldId}-storage`}
          className={touchControl}
          value={storageUnitId}
          onChange={(event) => setStorageUnitId(event.target.value)}
        >
          <option value="">{m.casaInventoryLooseItem()}</option>
          {props.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor={`${fieldId}-tags`} label={m.casaInventoryTags()}>
        {' '}
        <Input
          id={`${fieldId}-tags`}
          className={touchControl}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={m.casaInventoryTagsHint()}
        />
      </Field>
      <Field htmlFor={`${fieldId}-notes`} label={m.casaNotes()}>
        {' '}
        <Textarea
          id={`${fieldId}-notes`}
          className="min-h-16 text-[15px]"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${fieldId}-warranty-until`} label={m.casaInventoryWarrantyUntil()}>
        {' '}
        <Input
          id={`${fieldId}-warranty-until`}
          type="date"
          className={touchControl}
          value={warrantyUntil}
          onChange={(event) => setWarrantyUntil(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${fieldId}-warranty-notes`} label={m.casaInventoryWarrantyNotes()}>
        {' '}
        <Textarea
          id={`${fieldId}-warranty-notes`}
          className="min-h-16 text-[15px]"
          value={warrantyNotes}
          onChange={(event) => setWarrantyNotes(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${fieldId}-photo-caption`} label={m.casaInventoryPhotoCaption()}>
        {' '}
        <Input
          id={`${fieldId}-photo-caption`}
          className={touchControl}
          value={photoCaption}
          onChange={(event) => setPhotoCaption(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${fieldId}-photo`} label={m.casaInventoryPhoto()}>
        {' '}
        <Input
          id={`${fieldId}-photo`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="min-h-12 text-[13px]"
          onChange={(event) => void onFile(event, 'photo')}
        />
      </Field>
      {photoDataUrl === null ? null : (
        <img
          src={photoDataUrl}
          alt={photoCaption || m.casaInventoryPhoto()}
          className="max-h-40 rounded-md"
        />
      )}
      <Field htmlFor={`${fieldId}-receipt-caption`} label={m.casaInventoryReceiptCaption()}>
        {' '}
        <Input
          id={`${fieldId}-receipt-caption`}
          className={touchControl}
          value={receiptCaption}
          onChange={(event) => setReceiptCaption(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${fieldId}-receipt`} label={m.casaInventoryReceipt()}>
        {' '}
        <Input
          id={`${fieldId}-receipt`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="min-h-12 text-[13px]"
          onChange={(event) => void onFile(event, 'receipt')}
        />
      </Field>
      {receiptDataUrl === null ? null : (
        <img
          src={receiptDataUrl}
          alt={receiptCaption || m.casaInventoryReceipt()}
          className="max-h-40 rounded-md"
        />
      )}
      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-12" disabled={pending || name.trim() === ''}>
          {props.submitLabel}
        </Button>
        {props.onDelete === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            className="min-h-12"
            disabled={pending}
            onClick={() => void props.onDelete?.().catch((cause: unknown) => setError(problemText(cause)))}
          >
            {m.casaDelete()}
          </Button>
        )}
      </div>
    </form>
  );
}
