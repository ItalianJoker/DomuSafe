import type { LicenseTier } from '@/types/domus';
import type { FamilyBranding } from '@/types/premium';

/** Ruolo membro nella Famiglia (workspace condiviso). */
export type FamilyRole = 'OWNER' | 'MEMBER';

/**
 * Stato licenza per account.
 * `baseTier` = piano permanente; trial Premium lo sovrascrive via resolveEffectiveTier.
 */
export interface AccountLicenseState {
  baseTier: LicenseTier;
  trialUsed: boolean;
  trialStartedAt?: string;
  trialEndsAt?: string;
}

/**
 * Account pubblico (senza hash password).
 * Persistito sul server sotto `data/app/accounts`.
 */
export interface DomuAccount {
  version: '1.0.0';
  accountId: string;
  email: string;
  displayName: string;
  dataKeySaltBase64: string;
  wrappedDataKeyBase64: string;
  wrappedDataKeyIvBase64: string;
  familyId: string | null;
  license: AccountLicenseState;
  tutorialCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  accountId: string;
  email: string;
  displayName: string;
  role: FamilyRole;
  joinedAt: string;
}

/** Blob AES-GCM opaco (family-key wrap o seal invito). */
export interface SealedKeyBlob {
  ivBase64: string;
  ciphertextBase64: string;
}

export interface FamilyInvite {
  inviteId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  createdByAccountId: string;
  acceptedByAccountId?: string;
  /**
   * Family-key suggellata col token invito (prodotta dal client).
   * Il server la conserva senza poterla aprire.
   */
  sealedFamilyKey?: SealedKeyBlob;
}

/**
 * Famiglia = workspace. Runbook/successione su account→Famiglia (blob cifrati).
 * `scanToken` / `branding`: metadati Premium (non cifrati — non contengono vault/ICE).
 */
export interface DomuFamily {
  version: '1.0.0';
  familyId: string;
  name: string;
  ownerAccountId: string;
  members: FamilyMember[];
  invites: FamilyInvite[];
  /**
   * Family-key avvolta per ciascun membro con la propria account data-key.
   * Case e successione si cifrano con la family-key (workspace condiviso).
   */
  memberKeyWraps?: Record<string, SealedKeyBlob>;
  /** Token pubblico per QR di monitoraggio scan (Premium audit log). */
  scanToken?: string;
  /** White-label host (Premium customBranding). */
  branding?: FamilyBranding;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyInvitePayload {
  familyId: string;
  token: string;
}
