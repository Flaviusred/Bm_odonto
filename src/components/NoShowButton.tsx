import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { Appointment } from '../types';
import { canMarkNoShow, isOpenAppointment } from '../lib/appointmentStatus';
import { formatDateDDMMYYYY } from '../lib/dateUtils';
import { Button } from './Button';
import { Modal } from './Modal';

export function NoShowButton({ appointment, patientName, onMarkNoShow }: {
  appointment: Appointment;
  patientName: string;
  onMarkNoShow: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isOpenAppointment(appointment.status)) return null;
  const available = canMarkNoShow(appointment, now);
  const close = () => { if (!saving) setConfirming(false); };
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onMarkNoShow(appointment.id);
      setConfirming(false);
      toast.success('Não comparecimento registrado.');
    } catch (error) {
      console.error('Falha ao registrar não comparecimento:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao registrar não comparecimento.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!available}
        title={available ? 'Registrar não comparecimento' : 'Disponível a partir do horário agendado'}
        onClick={() => setConfirming(true)} className="gap-1 text-amber-700">
        <UserX className="h-4 w-4" /> Não compareceu
      </Button>
      <Modal isOpen={confirming} onClose={close} title="Registrar não comparecimento">
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Confirmar que <strong>{patientName}</strong> não compareceu ao agendamento de {formatDateDDMMYYYY(appointment.date)} às {appointment.time}?
            O horário continuará reservado no histórico.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancelar</Button>
            <Button type="button" disabled={saving} onClick={confirm}>{saving ? 'Salvando...' : 'Confirmar falta'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
