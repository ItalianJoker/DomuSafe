import { useState, type ChangeEvent } from 'react';
import type { Room, RoomPhotoSlot } from '@domusafe/contracts';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { problemText } from '@/lib/copy.js';
import { m } from '@/paraglide/messages.js';

/**
 * First-class gallery of room photo sets (day / evening / lights off).
 *
 * Preconditions: loaded lazily from Casa inventory or Domotica so the shell stays small.
 * Postconditions: each save patches one room through the inventory API with `If-Match`.
 * Data contract: images are small data addresses (png/jpeg/webp) or optional storage refs.
 *
 * @param props - Rooms of the open house and write capability.
 * @returns The gallery section.
 */
export function RoomPhotosGallery(props: {
  readonly rooms: readonly Room[];
  readonly canWrite: boolean;
  readonly onUpdateRoom: (
    room: Room,
    patch: {
      readonly photoDayDataUrl?: string | null;
      readonly photoEveningDataUrl?: string | null;
      readonly photoLightsOffDataUrl?: string | null;
    },
  ) => Promise<void>;
}) {
  return (
    <section className="grid gap-4 border-b border-border pb-6">
      <div className="grid gap-1">
        <h2 className="text-[14px] font-medium">{m.casaRoomPhotosTitle()}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.casaRoomPhotosLead()}</p>
      </div>
      {props.rooms.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.casaRoomPhotosEmpty()}</p>
      ) : (
        <div className="grid gap-6">
          {props.rooms.map((room) => (
            <RoomPhotoSet
              key={room.id}
              room={room}
              canWrite={props.canWrite}
              onUpdate={(patch) => props.onUpdateRoom(room, patch)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Compact read-only strip of room photos for Domotica (rooms before devices).
 *
 * Preconditions: rooms are already loaded; images are optional.
 * Postconditions: none — display only.
 * Data contract: prefers the data address; falls back to a short storage-ref label.
 *
 * @param props - Rooms of the open house.
 * @returns The strip.
 */
export function RoomPhotosStrip(props: { readonly rooms: readonly Room[] }) {
  if (props.rooms.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{m.casaRoomPhotosEmpty()}</p>;
  }
  return (
    <div className="grid gap-4">
      {props.rooms.map((room) => (
        <article key={room.id} className="grid gap-2 border-b border-border pb-3">
          <p className="text-[13px] font-medium">{room.name}</p>
          <div className="flex flex-wrap gap-3">
            {SLOT_ORDER.map((slot) => {
              const src = photoSrc(room, slot);
              return (
                <figure key={slot} className="grid w-24 gap-1">
                  <figcaption className="text-[11px] text-muted-foreground">{slotLabel(slot)}</figcaption>
                  {src === null ? (
                    <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                      {m.casaRoomPhotosMissing()}
                    </div>
                  ) : src.kind === 'image' ? (
                    <img src={src.value} alt="" className="h-16 w-24 rounded-md object-cover" />
                  ) : (
                    <p className="break-all text-[11px] text-muted-foreground">{src.value}</p>
                  )}
                </figure>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

const SLOT_ORDER: readonly RoomPhotoSlot[] = ['day', 'evening', 'lights_off'];

function slotLabel(slot: RoomPhotoSlot): string {
  switch (slot) {
    case 'day':
      return m.casaRoomPhotosDay();
    case 'evening':
      return m.casaRoomPhotosEvening();
    case 'lights_off':
      return m.casaRoomPhotosLightsOff();
  }
}

function photoSrc(
  room: Room,
  slot: RoomPhotoSlot,
): { readonly kind: 'image' | 'ref'; readonly value: string } | null {
  switch (slot) {
    case 'day':
      if (room.photoDayDataUrl !== null) {
        return { kind: 'image', value: room.photoDayDataUrl };
      }
      if (room.photoDayStorageRef !== null) {
        return { kind: 'ref', value: room.photoDayStorageRef };
      }
      return null;
    case 'evening':
      if (room.photoEveningDataUrl !== null) {
        return { kind: 'image', value: room.photoEveningDataUrl };
      }
      if (room.photoEveningStorageRef !== null) {
        return { kind: 'ref', value: room.photoEveningStorageRef };
      }
      return null;
    case 'lights_off':
      if (room.photoLightsOffDataUrl !== null) {
        return { kind: 'image', value: room.photoLightsOffDataUrl };
      }
      if (room.photoLightsOffStorageRef !== null) {
        return { kind: 'ref', value: room.photoLightsOffStorageRef };
      }
      return null;
  }
}

function RoomPhotoSet(props: {
  readonly room: Room;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: {
    readonly photoDayDataUrl?: string | null;
    readonly photoEveningDataUrl?: string | null;
    readonly photoLightsOffDataUrl?: string | null;
  }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(slot: RoomPhotoSlot, event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const dataUrl = await readRoomImageDataUrl(file);
      await props.onUpdate(patchForSlot(slot, dataUrl));
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'image'
          ? m.casaInventoryImageInvalid()
          : problemText(cause),
      );
    } finally {
      setPending(false);
    }
  }

  async function clearSlot(slot: RoomPhotoSlot): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await props.onUpdate(patchForSlot(slot, null));
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="grid gap-3">
      <h3 className="text-[14px] font-medium">{props.room.name}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        {SLOT_ORDER.map((slot) => {
          const src = photoSrc(props.room, slot);
          const fieldId = `room-photo-${props.room.id}-${slot}`;
          return (
            <div key={slot} className="grid gap-2">
              <Field htmlFor={fieldId} label={slotLabel(slot)}>
                {props.canWrite ? (
                  <input
                    id={fieldId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="block w-full text-[13px]"
                    disabled={pending}
                    onChange={(event) => void onFile(slot, event)}
                  />
                ) : (
                  <span className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</span>
                )}
              </Field>
              {src === null ? (
                <div className="flex min-h-12 items-center rounded-md border border-dashed border-border px-3 text-[13px] text-muted-foreground">
                  {m.casaRoomPhotosMissing()}
                </div>
              ) : src.kind === 'image' ? (
                <img src={src.value} alt={slotLabel(slot)} className="h-28 w-full rounded-md object-cover" />
              ) : (
                <p className="break-all text-[12px] text-muted-foreground">{src.value}</p>
              )}
              {props.canWrite && src !== null ? (
                <Button
                  type="button"
                  size="emergency"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void clearSlot(slot)}
                >
                  {m.casaRoomPhotosClear()}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}

function patchForSlot(
  slot: RoomPhotoSlot,
  dataUrl: string | null,
): {
  readonly photoDayDataUrl?: string | null;
  readonly photoEveningDataUrl?: string | null;
  readonly photoLightsOffDataUrl?: string | null;
} {
  switch (slot) {
    case 'day':
      return { photoDayDataUrl: dataUrl };
    case 'evening':
      return { photoEveningDataUrl: dataUrl };
    case 'lights_off':
      return { photoLightsOffDataUrl: dataUrl };
  }
}

async function readRoomImageDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error('image');
  }
  if (file.size > 18_000) {
    throw new Error('image');
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('image'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || result.length > 24_576) {
        reject(new Error('image'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
