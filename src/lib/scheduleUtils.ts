import type { DentistSchedule } from '../types';

export function normalizeDentistSchedules(schedules: DentistSchedule[]): DentistSchedule[] {
  const unique = new Map<string, DentistSchedule>();

  schedules.forEach((schedule) => {
    const key = `${schedule.dentistId}:${schedule.dayOfWeek}`;
    if (!unique.has(key)) {
      unique.set(key, schedule);
    }
  });

  return Array.from(unique.values());
}
