/**
 * Costruisce il pacchetto break-glass L1+L2 da pubblicare (senza vault).
 */
import type {
  DomusRunbookDocument,
  EmergencyBreakGlassPack,
  PetRecord,
  ResidentHealthRecord,
} from '@/types/domus';

function stripResidentForEmergency(
  resident: ResidentHealthRecord
): ResidentHealthRecord {
  // Nessun patrimonio personale / tasse nel pacchetto pubblico.
  return {
    id: resident.id,
    fullName: resident.fullName,
    birthYear: resident.birthYear,
    bloodGroup: resident.bloodGroup,
    allergies: resident.allergies,
    chronicConditions: resident.chronicConditions,
    medicalDevices: resident.medicalDevices,
    lifesavingMedicines: resident.lifesavingMedicines,
    mobilityStatus: resident.mobilityStatus,
    sleepingRoom: resident.sleepingRoom,
    iceContacts: resident.iceContacts,
    idDocumentHint: resident.idDocumentHint,
    photoDataUrl: resident.photoDataUrl,
  };
}

function stripPetForEmergency(pet: PetRecord): PetRecord {
  return {
    name: pet.name,
    species: pet.species,
    panicHideouts: pet.panicHideouts,
    vetEmergencyH24: pet.vetEmergencyH24,
  };
}

export function buildEmergencyPack(input: {
  familyName: string;
  document: DomusRunbookDocument;
}): EmergencyBreakGlassPack {
  return {
    version: '1.0.0',
    familyName: input.familyName,
    houseName: input.document.level1_public.houseName || 'Casa',
    publishedAt: new Date().toISOString(),
    level1: input.document.level1_public,
    level2: {
      residents: input.document.level2_ice.residents.map(
        stripResidentForEmergency
      ),
      pets: input.document.level2_ice.pets.map(stripPetForEmergency),
    },
  };
}
