import type { NotificationCategory } from '@domusafe/contracts';
import { m } from '@/paraglide/messages.js';

/**
 * Plain-language label for a notification category (Italian or English via messages).
 *
 * Preconditions: `category` is a known contract value.
 * Postconditions: returns a short phrase without acronyms.
 * Data contract: only the category enum; never includes titles or bodies.
 *
 * @param category - Notification category.
 * @returns Localized label.
 */
export function notificationCategoryLabel(category: NotificationCategory): string {
  switch (category) {
    case 'deadline':
      return m.notificationCategoryDeadline();
    case 'system':
      return m.notificationCategorySystem();
    case 'vault_reminder':
      return m.notificationCategoryVault();
    case 'emergency_scan':
      return m.notificationCategoryEmergencyScan();
    case 'sos':
      return m.notificationCategorySos();
    case 'chore':
      return m.notificationCategoryChore();
    case 'approval':
      return m.notificationCategoryApproval();
    case 'security':
      return m.notificationCategorySecurity();
  }
}
