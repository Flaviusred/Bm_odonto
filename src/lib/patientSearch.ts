import type { Patient } from '../types';

/** Minúsculas e sem acentos ("João" -> "joao"), para comparar buscas. */
export const normalizeText = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const digitsOf = (value: unknown) => String(value || '').replace(/\D/g, '');

/** Mapa id -> paciente, para localizar o titular de um dependente. */
export const indexPatients = (patients: Patient[]) => new Map(patients.map((p) => [p.id, p]));

/** Nome do titular, quando o paciente é dependente. */
export const getTitularName = (patient: Patient, byId: Map<string, Patient>) =>
  patient.dependentOf ? (byId.get(patient.dependentOf)?.name || '') : '';

const selfMatches = (patient: Patient | undefined, text: string, digits: string) => {
  if (!patient) return false;
  if (text && normalizeText(patient.name).includes(text)) return true;
  return digits.length >= 3 && digitsOf(patient.cpf).includes(digits);
};

/**
 * Busca de paciente por nome (sem diferenciar acentos) ou CPF. Um dependente também é encontrado
 * quando a busca corresponde ao titular, para que a família apareça junta.
 */
export const matchesPatientSearch = (patient: Patient, term: string, byId: Map<string, Patient>) => {
  const text = normalizeText(term);
  if (!text) return true;
  const digits = /^[\d.\-\s/]+$/.test(term.trim()) ? digitsOf(term) : '';
  const textForName = digits ? '' : text;
  if (selfMatches(patient, textForName, digits)) return true;
  return !!patient.dependentOf && selfMatches(byId.get(patient.dependentOf), textForName, digits);
};
