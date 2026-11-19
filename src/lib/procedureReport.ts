import { PROCEDURE_LABELS } from '../constants';
import type { Dentist, Treatment } from '../types';
import { parseDate } from './dateUtils';

export type ProcedureReportRow = {
  dentistId: string;
  dentist: string;
  type: string;
  quantity: number;
};

export function getProcedureReport(
  treatments: Treatment[],
  dentists: Dentist[],
  start: Date | null,
  end: Date | null,
): ProcedureReportRow[] {
  const dentistNames = new Map(dentists.map(dentist => [dentist.id, dentist.name]));
  const grouped = new Map<string, Map<string, number>>();
  for (const treatment of treatments) {
    const date = parseDate(treatment.date);
    if (Number.isNaN(date.getTime()) || (start && date < start) || (end && date > end)) continue;
    let types = grouped.get(treatment.dentistId);
    if (!types) {
      types = new Map();
      grouped.set(treatment.dentistId, types);
    }
    for (const procedure of treatment.procedures) {
      const label = PROCEDURE_LABELS[procedure.type] || procedure.type;
      const quantity = Number(procedure.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      types.set(label, (types.get(label) || 0) + quantity);
    }
  }
  const rows: ProcedureReportRow[] = [];
  grouped.forEach((types, dentistId) => {
    types.forEach((quantity, type) => rows.push({
      dentistId,
      dentist: dentistNames.get(dentistId) || `Dentista não identificado (${dentistId || 'sem ID'})`,
      type,
      quantity,
    }));
  });
  return rows.sort((a, b) => a.dentist.localeCompare(b.dentist, 'pt-BR') ||
    a.dentistId.localeCompare(b.dentistId) || a.type.localeCompare(b.type, 'pt-BR'));
}

export function getProcedureTypeTotals(rows: ProcedureReportRow[]) {
  const totals = new Map<string, number>();
  rows.forEach(row => totals.set(row.type, (totals.get(row.type) || 0) + row.quantity));
  return Array.from(totals, ([type, quantity]) => ({ type, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.type.localeCompare(b.type, 'pt-BR'));
}
