/** Roles inside a family (phase 1 §6.1). */
export const MEMBER_ROLES = ['admin', 'parent', 'child', 'caregiver', 'guest'] as const;
/** A family role. */
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * How a role holds a permission (phase 3 §8.3):
 * `all` everywhere in the family · `scoped` only on assigned houses/residents · `own` only on own data ·
 * `owner` only for the family owner · `concession` only with an explicit vault concession.
 */
export type Grant = 'all' | 'scoped' | 'own' | 'owner' | 'concession';

type Row = Readonly<Record<MemberRole, Grant | null>>;

function row(
  admin: Grant | null,
  parent: Grant | null = null,
  child: Grant | null = null,
  caregiver: Grant | null = null,
  guest: Grant | null = null,
): Row {
  return { admin, parent, child, caregiver, guest };
}

const ALL_READ = row('all', 'all', 'all', 'scoped', 'scoped');
const MEMBERS_READ = row('all', 'all', 'all', 'scoped');
const MANAGERS = row('all', 'all');
const ADMIN_ONLY = row('all');
const OWN_DATA = row('own', 'own', 'own', 'own');

/** Permission matrix of phase 3 §8.3, one row per permission. */
export const PERMISSION_MATRIX = {
  'family.read': row('all', 'all', 'all', 'all', 'all'),
  'family.manage': ADMIN_ONLY,
  'family.delete': row('owner'),
  'members.read': MEMBERS_READ,
  'members.manage': ADMIN_ONLY,
  'invitations.create': ADMIN_ONLY,
  'invitations.create_guest': MANAGERS,
  'access_requests.decide': ADMIN_ONLY,
  'ownership.transfer': row('owner'),
  'billing.read': ADMIN_ONLY,
  'billing.manage': row('owner'),
  'keys.scope.create': row('all', 'own', 'own', 'own'),
  'keys.scope.rotate': row('all', 'own', 'own', 'own'),
  'keys.scope.grant': row('all', 'scoped'),
  'houses.read': ALL_READ,
  'houses.manage': ADMIN_ONLY,
  'house.read': MEMBERS_READ,
  'house.technical.read': MEMBERS_READ,
  'house.write': MANAGERS,
  'house.technical.write': MANAGERS,
  'house.guest_view.read': ALL_READ,
  'house.guest_view.write': MANAGERS,
  'contacts.read': ALL_READ,
  'contacts.write': MANAGERS,
  'utilities.read': MANAGERS,
  'utilities.write': MANAGERS,
  'maintenance.read': MEMBERS_READ,
  'maintenance.write': MANAGERS,
  'inventory.read': MEMBERS_READ,
  'inventory.write': MANAGERS,
  'automation.read': MEMBERS_READ,
  'automation.manage': ADMIN_ONLY,
  'residents.read': MEMBERS_READ,
  'residents.write': MANAGERS,
  'health.read': row('all', 'all', 'own', 'scoped'),
  'health.write': row('all', 'all', null, 'scoped'),
  'health.confirm_intake': row('all', 'all', 'own', 'scoped'),
  'pets.read': MEMBERS_READ,
  'pets.write': MANAGERS,
  'emergency.use': row('all', 'all', 'all', 'all', 'all'),
  'emergency.sos': row('all', 'all', 'all', 'all'),
  'emergency.configure': MANAGERS,
  'calendar.read': MEMBERS_READ,
  'calendar.write': row('all', 'all', 'own', 'scoped'),
  'chores.manage': MANAGERS,
  'chores.complete': row('all', 'all', 'own'),
  'care.read': row('all', 'all', null, 'scoped', 'scoped'),
  'care.write': row('all', 'all', null, 'scoped', 'scoped'),
  'care.relationships': OWN_DATA,
  'rewards.read': row('all', 'all', 'own'),
  'rewards.adjust': MANAGERS,
  'rewards.manage': MANAGERS,
  'rewards.approve': MANAGERS,
  'rewards.request': row(null, null, 'own'),
  'kitchen.read': MEMBERS_READ,
  'kitchen.write': row('all', 'all', null, 'scoped'),
  'shopping.read': MEMBERS_READ,
  'shopping.write': MEMBERS_READ,
  'finance.read': row('all', 'all', 'own'),
  'finance.write': MANAGERS,
  'vault.family.read': row('all', 'concession'),
  'vault.family.write': row('all', 'concession'),
  'vault.personal.read': OWN_DATA,
  'vault.personal.write': OWN_DATA,
  'personal.read': OWN_DATA,
  'personal.write': OWN_DATA,
  'taxes.read': row('all', 'all', 'own'),
  'taxes.write': row('all', 'all', 'own'),
  'deadlines.read': MEMBERS_READ,
  'deadlines.write': row('all', 'all', 'own', 'scoped'),
  'qr.manage': MANAGERS,
  'qr.print': row('all', 'all', null, 'scoped'),
  'audit.read': ADMIN_ONLY,
  'integrations.manage': ADMIN_ONLY,
  'kiosk.manage': ADMIN_ONLY,
  'branding.manage': ADMIN_ONLY,
  'custom_fields.manage': MANAGERS,
  'assistant.manage': ADMIN_ONLY,
  'assistant.use': MANAGERS,
  'export.full': row('all', 'all', 'all', 'all'),
} as const satisfies Record<string, Row>;

/** A permission of the catalogue. */
export type Permission = keyof typeof PERMISSION_MATRIX;
/** Every permission, in catalogue order. */
export const PERMISSIONS = Object.keys(PERMISSION_MATRIX) as Permission[];

/**
 * Administration permissions: held by Administrators only. Accounts that sign in with a password must
 * have two-factor authentication enabled before using them (phase 1 decision 9, phase 3 §4).
 */
export const TWO_FACTOR_PERMISSIONS: ReadonlySet<Permission> = new Set(
  PERMISSIONS.filter((permission) => {
    const grants: Row = PERMISSION_MATRIX[permission];
    return MEMBER_ROLES.every((role) => role === 'admin' || grants[role] === null);
  }),
);

/** The member asking for a permission. */
export interface AccessSubject {
  readonly role: MemberRole;
  readonly isOwner: boolean;
  readonly vaultFamilyConcession: boolean;
}

/** Result of a permission check: denied, or allowed with the scope the module must still enforce. */
export type AccessDecision =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly scope: 'all' | 'scoped' | 'own' };

/**
 * Decides whether a member holds a permission. Resource-level scope (`scoped`, `own`) is returned for the
 * module policy to enforce; the database RLS enforces it again.
 *
 * @param subject - Role, ownership and vault concession of the member.
 * @param permission - Permission from the catalogue.
 * @returns The decision.
 */
export function decide(subject: AccessSubject, permission: Permission): AccessDecision {
  const grants: Row = PERMISSION_MATRIX[permission];
  const grant = grants[subject.role];
  switch (grant) {
    case null:
      return { allowed: false };
    case 'owner':
      return subject.isOwner ? { allowed: true, scope: 'all' } : { allowed: false };
    case 'concession':
      return subject.vaultFamilyConcession ? { allowed: true, scope: 'all' } : { allowed: false };
    case 'all':
    case 'scoped':
    case 'own':
      return { allowed: true, scope: grant };
  }
}

/**
 * Shorthand for `decide(subject, permission).allowed`, used by the web app to hide unavailable actions.
 *
 * @param subject - Role, ownership and vault concession of the member.
 * @param permission - Permission from the catalogue.
 * @returns `true` when the action is allowed at least on part of the family.
 */
export function can(subject: AccessSubject, permission: Permission): boolean {
  return decide(subject, permission).allowed;
}

/** Permissions of a kiosk device by profile (phase 3 §7.3). */
export const KIOSK_PERMISSIONS: Readonly<Record<'standard' | 'elderly', ReadonlySet<Permission>>> = {
  standard: new Set<Permission>([
    'house.guest_view.read',
    'deadlines.read',
    'calendar.read',
    'chores.complete',
    'shopping.read',
    'shopping.write',
    'emergency.use',
  ]),
  elderly: new Set<Permission>([
    'house.guest_view.read',
    'deadlines.read',
    'calendar.read',
    'chores.complete',
    'shopping.read',
    'shopping.write',
    'emergency.use',
    'emergency.sos',
    'health.read',
    'health.confirm_intake',
  ]),
};

/** Scopes of personal access tokens used by agents and the MCP server (phase 3 §7.6). */
export const TOKEN_SCOPES = ['read', 'proposals:write'] as const;
/** A personal access token scope. */
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Permissions a personal access token may exercise, on top of its owner's own permissions. */
export const TOKEN_SCOPE_PERMISSIONS: Readonly<Record<TokenScope, ReadonlySet<Permission>>> = {
  read: new Set<Permission>([
    'family.read',
    'houses.read',
    'house.read',
    'house.guest_view.read',
    'deadlines.read',
    'calendar.read',
    'shopping.read',
    'maintenance.read',
    'inventory.read',
  ]),
  'proposals:write': new Set<Permission>(['assistant.use']),
};
