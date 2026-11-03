import type { BloodGroup, EvacuationMobility } from '@/types/domus';

/** Etichette italiane per gruppi sanguigni. */
export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  '0-': '0−',
  '0+': '0+',
  'A-': 'A−',
  'A+': 'A+',
  'B-': 'B−',
  'B+': 'B+',
  'AB-': 'AB−',
  'AB+': 'AB+',
  UNKNOWN: 'Sconosciuto',
};

/** Etichette italiane per mobilità in evacuazione. */
export const MOBILITY_LABELS: Record<EvacuationMobility, string> = {
  FULLY_AUTONOMOUS: 'Autonomo',
  REDUCED_MOBILITY: 'Mobilità ridotta',
  NON_AMBULATORY: 'Non deambulante',
  SENSORY_IMPAIRMENT: 'Disabilità sensoriale',
};

export const WEEKDAYS = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
] as const;
