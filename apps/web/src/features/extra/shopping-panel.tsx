import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ShoppingItem, ShoppingList, Store } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { shoppingItemsQuery, shoppingListsQuery, storesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function groupByAisle(
  items: readonly ShoppingItem[],
  aisleOrder: readonly string[],
): readonly { readonly aisle: string; readonly items: readonly ShoppingItem[] }[] {
  const orderIndex = new Map(aisleOrder.map((aisle, index) => [aisle, index]));
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const aisle = item.aisle ?? m.extraAisleOther();
    const bucket = groups.get(aisle) ?? [];
    bucket.push(item);
    groups.set(aisle, bucket);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.localeCompare(right, 'it');
    })
    .map(([aisle, grouped]) => ({ aisle, items: grouped }));
}

/**
 * Shopping lists organised by store and aisle, with manual check-off.
 *
 * Preconditions: the caller can read shopping lists.
 * Postconditions: list and item edits persist in Postgres; concurrent checks use versioning.
 * Data contract: no browser source of truth.
 *
 * @param props - Family, open house and write capability.
 * @returns The panel.
 */
export function ShoppingPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const stores = useQuery(storesQuery(api, props.familyId));
  const lists = useQuery(shoppingListsQuery(api, props.familyId, props.houseId));
  const [selectedListId, setSelectedListId] = useState<string>('');
  const listId = selectedListId !== '' ? selectedListId : (lists.data?.[0]?.id ?? '');
  const items = useQuery({
    ...shoppingItemsQuery(api, props.familyId, listId),
    enabled: listId !== '',
  });

  const [storeName, setStoreName] = useState('');
  const [aisleOrder, setAisleOrder] = useState('');
  const [listName, setListName] = useState('');
  const [listStoreId, setListStoreId] = useState<string>('none');
  const [itemName, setItemName] = useState('');
  const [itemAisle, setItemAisle] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemUnit, setItemUnit] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedList: ShoppingList | undefined = lists.data?.find((list) => list.id === listId);
  const selectedStore: Store | undefined = stores.data?.find((store) => store.id === selectedList?.storeId);
  const grouped = useMemo(
    () => groupByAisle(items.data ?? [], selectedStore?.aisleOrder ?? []),
    [items.data, selectedStore?.aisleOrder],
  );

  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stores', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['shopping-lists', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['shopping-items', props.familyId] }),
    ]);
  }

  async function addStore(): Promise<void> {
    if (storeName.trim() === '') {
      setError(m.extraStoreNeedName());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createStore(props.familyId, crypto.randomUUID(), {
        name: storeName.trim(),
        aisleOrder: aisleOrder
          .split(/[,;\n]+/)
          .map((aisle) => aisle.trim())
          .filter((aisle) => aisle.length > 0)
          .slice(0, 64),
      });
      setStoreName('');
      setAisleOrder('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addList(): Promise<void> {
    if (listName.trim() === '') {
      setError(m.extraListNeedName());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await api.createShoppingList(props.familyId, crypto.randomUUID(), {
        name: listName.trim(),
        houseId: props.houseId,
        storeId: listStoreId === 'none' ? null : listStoreId,
      });
      setListName('');
      setSelectedListId(created.id);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addItem(): Promise<void> {
    if (listId === '') {
      setError(m.extraListNeedSelect());
      return;
    }
    if (itemName.trim() === '') {
      setError(m.extraItemNeedName());
      return;
    }
    const quantity = itemQuantity.trim() === '' ? null : Number(itemQuantity.trim().replace(',', '.'));
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setError(m.extraItemNeedQuantity());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createShoppingItem(props.familyId, listId, crypto.randomUUID(), {
        name: itemName.trim(),
        quantity,
        unit: blank(itemUnit),
        aisle: blank(itemAisle),
      });
      setItemName('');
      setItemQuantity('');
      setItemUnit('');
      setItemAisle('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function toggleItem(item: ShoppingItem): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.checkShoppingItem(props.familyId, item.listId, item.id, item.version, {
        checked: item.checkedAt === null,
      });
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function removeItem(item: ShoppingItem): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.deleteShoppingItem(props.familyId, item.listId, item.id, item.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  if (stores.isPending || lists.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (stores.isError || lists.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(stores.error ?? lists.error)}
      </p>
    );
  }

  const storeItems = stores.data;
  const listItems = lists.data;

  return (
    <section className="grid max-w-xl gap-8">
      <div>
        <h2 className="text-[15px] font-medium">{m.extraShoppingTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraShoppingLead()}</p>
      </div>

      {props.canWrite ? (
        <div className="grid gap-4">
          <h3 className="text-[13px] font-medium">{m.extraStoreCreate()}</h3>
          <Field label={m.extraStoreName()} htmlFor="store-name">
            <Input
              id="store-name"
              className={touchControl}
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
            />
          </Field>
          <Field label={m.extraStoreAisles()} htmlFor="store-aisles">
            <Input
              id="store-aisles"
              className={touchControl}
              value={aisleOrder}
              onChange={(event) => setAisleOrder(event.target.value)}
              placeholder={m.extraStoreAislesHint()}
            />
          </Field>
          <Button size="emergency" disabled={pending} onClick={() => void addStore()}>
            {m.extraStoreSave()}
          </Button>
        </div>
      ) : null}

      {props.canWrite ? (
        <div className="grid gap-4 border-t border-border pt-4">
          <h3 className="text-[13px] font-medium">{m.extraListCreate()}</h3>
          <Field label={m.extraListName()} htmlFor="list-name">
            <Input
              id="list-name"
              className={touchControl}
              value={listName}
              onChange={(event) => setListName(event.target.value)}
            />
          </Field>
          <Field label={m.extraListStore()} htmlFor="list-store">
            <Select value={listStoreId} onValueChange={setListStoreId}>
              <SelectTrigger id="list-store" className="min-h-12 w-full text-[15px]">
                <SelectValue placeholder={m.extraListStoreNone()} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.extraListStoreNone()}</SelectItem>
                {storeItems.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button size="emergency" disabled={pending} onClick={() => void addList()}>
            {m.extraListSave()}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3">
        <h3 className="text-[13px] font-medium">{m.extraListsTitle()}</h3>
        {listItems.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.extraListsEmpty()}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {listItems.map((list) => (
              <Button
                key={list.id}
                variant={list.id === listId ? 'default' : 'outline'}
                size="emergency"
                onClick={() => setSelectedListId(list.id)}
              >
                {list.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {listId === '' ? null : (
        <div className="grid gap-4 border-t border-border pt-4">
          <h3 className="text-[13px] font-medium">
            {selectedList?.name ?? m.extraItemsTitle()}
            {selectedStore === undefined ? '' : ` · ${selectedStore.name}`}
          </h3>
          {props.canWrite ? (
            <div className="grid gap-3">
              <Field label={m.extraItemName()} htmlFor="item-name">
                <Input
                  id="item-name"
                  className={touchControl}
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label={m.extraItemQuantity()} htmlFor="item-quantity">
                  <Input
                    id="item-quantity"
                    className={touchControl}
                    value={itemQuantity}
                    onChange={(event) => setItemQuantity(event.target.value)}
                  />
                </Field>
                <Field label={m.extraItemUnit()} htmlFor="item-unit">
                  <Input
                    id="item-unit"
                    className={touchControl}
                    value={itemUnit}
                    onChange={(event) => setItemUnit(event.target.value)}
                  />
                </Field>
                <Field label={m.extraItemAisle()} htmlFor="item-aisle">
                  <Input
                    id="item-aisle"
                    className={touchControl}
                    value={itemAisle}
                    onChange={(event) => setItemAisle(event.target.value)}
                  />
                </Field>
              </div>
              <Button size="emergency" disabled={pending} onClick={() => void addItem()}>
                {m.extraItemSave()}
              </Button>
            </div>
          ) : null}

          {items.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
          {items.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {problemText(items.error)}
            </p>
          ) : null}
          {(items.data?.length ?? 0) === 0 && !items.isPending ? (
            <p className="text-[13px] text-muted-foreground">{m.extraItemsEmpty()}</p>
          ) : null}
          {grouped.map((group) => (
            <div key={group.aisle} className="grid gap-2">
              <h4 className="text-[13px] font-medium text-muted-foreground">{group.aisle}</h4>
              <ul className="divide-y divide-border border-y border-border">
                {group.items.map((item) => (
                  <li key={item.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <button
                      type="button"
                      className={
                        item.checkedAt === null
                          ? 'min-h-12 flex-1 text-left text-[15px]'
                          : 'min-h-12 flex-1 text-left text-[15px] text-muted-foreground line-through'
                      }
                      disabled={!props.canWrite || pending}
                      onClick={() => void toggleItem(item)}
                    >
                      {item.name}
                      {item.quantity === null
                        ? ''
                        : ` · ${String(item.quantity)}${item.unit === null ? '' : ` ${item.unit}`}`}
                    </button>
                    {props.canWrite ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-12 text-destructive"
                        disabled={pending}
                        onClick={() => void removeItem(item)}
                      >
                        {m.extraDelete()}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
