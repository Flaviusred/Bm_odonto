import type { Appointment } from '../types';
import { parseDateTime } from './dateUtils';

export function isOpenAppointment(status: Appointment['status']): boolean {
  return ['scheduled', 'confirmed', 'Agendado', 'Confirmado'].includes(status);
}

export function canMarkNoShow(appointment: Appointment, now = new Date()): boolean {
  if (!isOpenAppointment(appointment.status) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(appointment.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(appointment.time)) return false;
  const start = parseDateTime(appointment.date, appointment.time);
  const [year, month, day] = appointment.date.split('-').map(Number);
  return start.getFullYear() === year && start.getMonth() === month - 1 &&
    start.getDate() === day && start.getTime() <= now.getTime();
}
