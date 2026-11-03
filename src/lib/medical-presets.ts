/**
 * Preset rapidi per schede ICE (allergie / patologie / dispositivi).
 * Solo etichette IT — nessun dato clinico esterno.
 */

export const ALLERGY_PRESETS = [
  'Lattosio',
  'Glutine',
  'Noci / frutta a guscio',
  'Penicillina',
  'Punture di insetto',
] as const;

export const CONDITION_PRESETS = [
  'Diabete',
  'Asma',
  'Epilessia',
  'Cardiopatia',
  'Ipertensione',
] as const;

export const DEVICE_PRESETS = [
  'Pacemaker',
  'Insulina pen / pompa',
  'Inalatore',
  'Protesi acustica',
  'Sedia a rotelle',
] as const;

/** Aggiunge un preset a una lista senza duplicati (case-insensitive). */
export function togglePreset(list: string[], preset: string): string[] {
  const normalized = preset.trim();
  if (!normalized) return list;
  const exists = list.some(
    (item) => item.trim().toLowerCase() === normalized.toLowerCase()
  );
  if (exists) {
    return list.filter(
      (item) => item.trim().toLowerCase() !== normalized.toLowerCase()
    );
  }
  return [...list, normalized];
}
