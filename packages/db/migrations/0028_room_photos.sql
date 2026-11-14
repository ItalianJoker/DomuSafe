-- Room photo sets: day / evening / lights-off (master prompt §2/§4, phase 2 §6.13).
-- Class C. Small image data addresses (or future object-store refs) until the files table ships.
-- Roles map to design photo_day, photo_evening, photo_lights_off on resource_type rooms.

alter table public.rooms
  add column photo_day_data_url text
    check (photo_day_data_url is null or char_length(photo_day_data_url) between 32 and 24576),
  add column photo_evening_data_url text
    check (photo_evening_data_url is null or char_length(photo_evening_data_url) between 32 and 24576),
  add column photo_lights_off_data_url text
    check (photo_lights_off_data_url is null or char_length(photo_lights_off_data_url) between 32 and 24576),
  add column photo_day_storage_ref text
    check (photo_day_storage_ref is null or char_length(btrim(photo_day_storage_ref)) between 1 and 512),
  add column photo_evening_storage_ref text
    check (photo_evening_storage_ref is null or char_length(btrim(photo_evening_storage_ref)) between 1 and 512),
  add column photo_lights_off_storage_ref text
    check (
      photo_lights_off_storage_ref is null
      or char_length(btrim(photo_lights_off_storage_ref)) between 1 and 512
    );
