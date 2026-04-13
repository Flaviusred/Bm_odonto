// Constantes globais do projeto OdontoClinic

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
} as const;

export const TREATMENT_TYPES = {
  CLEANING: 'Limpeza',
  EXTRACTION: 'Extração',
  FILLING: 'Obturação',
  ROOT_CANAL: 'Canal',
  ORTHODONTICS: 'Ortodontia',
  OTHER: 'Outro',
} as const;

export const DOCUMENT_TYPES = {
  EXAM: 'exam',
  DOCUMENT: 'document',
  XRAY: 'x-ray',
} as const;

export const USER_ROLES = {
  ADMIN: 'admin',
  DENTIST: 'dentist',
  ATTENDANT: 'attendant',
  PATIENT: 'patient',
} as const;

export const MAX_FILE_SIZE_MB = 5;
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
