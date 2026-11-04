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

export const PROCEDURE_TYPES = [
  { code: 'DENTISTICA', label: 'Dentística' },
  { code: 'PERIODONTIA', label: 'Periodontia' },
  { code: 'PROFILAXIA', label: 'Profilaxia' },
  { code: 'RAIO_X', label: 'Raio-X' },
  { code: 'EXODONTIA', label: 'Exodontia' },
  { code: 'ENCAMINHAMENTO', label: 'Encaminhamento' },
  { code: 'AVALIACAO', label: 'Avaliação' },
  { code: 'RECEITA_PRESCRICAO', label: 'Receita/Prescrição' },
  { code: 'ENDODONTIA', label: 'Endodontia' },
  { code: 'ORTODONTIA', label: 'Ortodontia' },
  { code: 'OUTRO', label: 'Outro' },
] as const;

export type ProcedureType = typeof PROCEDURE_TYPES[number]['code'];

export const PROCEDURE_LABELS: Record<ProcedureType, string> = Object.fromEntries(
  PROCEDURE_TYPES.map(({ code, label }) => [code, label])
) as Record<ProcedureType, string>;

const LEGACY_PROCEDURE_MAP: Record<string, ProcedureType> = {
  Limpeza: 'PROFILAXIA',
  cleaning: 'PROFILAXIA',
  Cleaning: 'PROFILAXIA',
  Extração: 'EXODONTIA',
  extraction: 'EXODONTIA',
  Extraction: 'EXODONTIA',
  Obturação: 'DENTISTICA',
  filling: 'DENTISTICA',
  Filling: 'DENTISTICA',
  Canal: 'ENDODONTIA',
  'root-canal': 'ENDODONTIA',
  'Root Canal': 'ENDODONTIA',
  Ortodontia: 'ORTODONTIA',
  orthodontics: 'ORTODONTIA',
  Orthodontics: 'ORTODONTIA',
  Outro: 'OUTRO',
  other: 'OUTRO',
  Other: 'OUTRO',
};

export function normalizeProcedureType(value: unknown): ProcedureType {
  if (typeof value === 'string' && value in PROCEDURE_LABELS) {
    return value as ProcedureType;
  }
  if (typeof value === 'string' && LEGACY_PROCEDURE_MAP[value]) {
    return LEGACY_PROCEDURE_MAP[value];
  }
  return 'OUTRO';
}

export function normalizeTreatmentProcedures(data: {
  procedures?: Array<{ type?: unknown; quantity?: unknown; description?: unknown }>;
  type?: unknown;
  description?: unknown;
}) {
  if (Array.isArray(data.procedures) && data.procedures.length > 0) {
    return data.procedures.map((procedure) => ({
      type: normalizeProcedureType(procedure.type),
      quantity: Math.max(1, Math.floor(Number(procedure.quantity) || 1)),
      ...(typeof procedure.description === 'string' && procedure.description.trim()
        ? { description: procedure.description.trim() }
        : {}),
    }));
  }

  const type = normalizeProcedureType(data.type);
  return [{
    type,
    quantity: 1,
    ...(type === 'OUTRO' && typeof data.description === 'string' && data.description.trim()
      ? { description: data.description.trim() }
      : {}),
  }];
}

export function formatTreatmentProcedures(
  procedures: Array<{ type: ProcedureType; quantity: number; description?: string }>
) {
  return procedures.map(({ type, quantity, description }) =>
    `${PROCEDURE_LABELS[type] || type} (${quantity}${type === 'OUTRO' && description ? `: ${description}` : ''})`
  ).join(', ');
}

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
