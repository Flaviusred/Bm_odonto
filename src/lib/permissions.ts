import { User, UserRole } from '../types';

const ROLE_BASE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'dashboard',
    'dashboard-period',
    'dashboard-by-type',
    'dashboard-by-dentist',
    'dashboard-by-status',
    'dashboard-export-sheet',
    'dashboard-export-pdf',
    'dentists',
    'patients',
    'attendants',
    'treatments',
    'appointments',
    'dentist-schedules',
    'inventory',
    'announcements',
    'audit',
    'users',
    'settings',
  ],
  dentist: ['dentist-appointments', 'dentist-patients', 'dentist-treatments'],
  attendant: ['patients', 'appointments'],
  patient: ['patient-profile', 'patient-appointments', 'patient-treatments'],
};

const ROLE_HOME_TAB: Record<UserRole, string> = {
  admin: 'dashboard',
  dentist: 'dentist-appointments',
  attendant: 'patients',
  patient: 'patient-profile',
};

function uniquePermissions(permissions: string[]) {
  return Array.from(new Set(permissions.filter(Boolean)));
}

export function getRoleBasePermissions(role?: UserRole) {
  if (!role) return [];
  return ROLE_BASE_PERMISSIONS[role] || [];
}

export function getEffectivePermissions(user?: Pick<User, 'role' | 'permissions'> | null) {
  if (!user) return [];
  return uniquePermissions([
    ...getRoleBasePermissions(user.role),
    ...((user.permissions || []) as string[]),
  ]);
}

export function canAccessTab(user: Pick<User, 'role' | 'permissions'> | null | undefined, tab: string) {
  if (!user) return false;
  return getEffectivePermissions(user).includes(tab);
}

export function getDefaultTabForUser(user?: Pick<User, 'role' | 'permissions'> | null) {
  if (!user) return 'dashboard';
  const roleHome = ROLE_HOME_TAB[user.role] || 'dashboard';
  if (canAccessTab(user, roleHome)) return roleHome;
  const effectivePermissions = getEffectivePermissions(user);
  return effectivePermissions[0] || roleHome;
}

export function isDentistTab(tab: string) {
  return ['dentist-appointments', 'dentist-patients', 'dentist-treatments'].includes(tab);
}

export function isPatientTab(tab: string) {
  return ['patient-profile', 'patient-appointments', 'patient-treatments'].includes(tab);
}