import { useState } from 'react';
import React from 'react';
import { Plus, Search, Calendar, Clock, User, UserRound, MoreVertical, CheckCircle2, XCircle, AlertCircle, Stethoscope, MessageCircle } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { Appointment, Patient, Dentist, DentistSchedule } from '../types';
import { cn } from '../lib/utils';

interface AppointmentListProps {
  appointments: Appointment[];
  patients: Patient[];
  dentists: Dentist[];
  schedules: DentistSchedule[];
  onAddAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void;
  onUpdateStatus: (id: string, status: Appointment['status']) => void;
  onUpdateAppointment: (appointment: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
}

export function AppointmentList({ 
  appointments, 
  patients, 
  dentists, 
  schedules,
  onAddAppointment, 
  onUpdateStatus,
  onUpdateAppointment,
  onDeleteAppointment 
}: AppointmentListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    patientId: '',
    dentistId: '',
    date: '',
    time: '',
    notes: '',
  });

  const getPatient = (id: string) => patients.find(p => p.id === id);
  const getPatientName = (id: string) => getPatient(id)?.name || 'Paciente não encontrado';
  const getDentistName = (id: string) => dentists.find(d => d.id === id)?.name || 'Dentista não encontrado';

  const handleWhatsAppReminder = (apt: Appointment) => {
    const patient = getPatient(apt.patientId);
    if (!patient) return;

    const date = new Date(apt.date).toLocaleDateString('pt-BR');
    const message = `Olá ${patient.name}, este é um lembrete da sua consulta na OdontoClinic com ${getDentistName(apt.dentistId)} no dia ${date} às ${apt.time}.`;
    const phone = patient.phone.replace(/\D/g, '');
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const filteredAppointments = appointments.filter(apt => 
    getPatientName(apt.patientId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getDentistName(apt.dentistId).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleShowAnamnesis = (patientId: string) => {
    const patient = getPatient(patientId);
    if (patient) {
      setSelectedPatient(patient);
      setIsAnamnesisModalOpen(true);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.patientId) newErrors.patientId = 'Selecione um paciente';
    if (!formData.dentistId) newErrors.dentistId = 'Selecione um dentista';
    if (!formData.date) newErrors.date = 'Data é obrigatória';
    if (!formData.time) newErrors.time = 'Horário é obrigatório';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getAvailableSlots = () => {
    if (!formData.dentistId || !formData.date) return [];
    const selectedDate = new Date(formData.date);
    const dayOfWeek = selectedDate.getDay();
    const schedule = schedules.find(s => s.dentistId === formData.dentistId && s.dayOfWeek === dayOfWeek);
    if (!schedule) return [];

    const slots = [];
    let [startH, startM] = schedule.startTime.split(':').map(Number);
    let [endH, endM] = schedule.endTime.split(':').map(Number);
    
    let currentTime = new Date();
    currentTime.setHours(startH, startM, 0, 0);
    const endTime = new Date();
    endTime.setHours(endH, endM, 0, 0);
    
    while (currentTime < endTime) {
      const timeStr = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isBooked = appointments.some(apt => apt.dentistId === formData.dentistId && apt.date === formData.date && apt.time === timeStr && apt.status !== 'cancelled');
      if (!isBooked) {
        slots.push(timeStr);
      }
      currentTime.setMinutes(currentTime.getMinutes() + schedule.slotDuration);
    }
    return slots;
  };

  const availableSlots = getAvailableSlots();

  const openEditModal = (apt: Appointment) => {
    setEditingAppointment(apt);
    setFormData({
      patientId: apt.patientId,
      dentistId: apt.dentistId,
      date: apt.date,
      time: apt.time,
      notes: apt.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (editingAppointment) {
      onUpdateAppointment({
        ...editingAppointment,
        ...formData,
      });
    } else {
      onAddAppointment({
        ...formData,
        status: 'scheduled',
      });
    }
    setIsModalOpen(false);
    setEditingAppointment(null);
    setFormData({ patientId: '', dentistId: '', date: '', time: '', notes: '' });
    setErrors({});
  };

  const statusColors = {
    scheduled: 'bg-zinc-100 text-zinc-600',
    confirmed: 'bg-blue-100 text-blue-600',
    cancelled: 'bg-red-100 text-red-600',
    completed: 'bg-emerald-100 text-emerald-600',
  };

  const statusLabels = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Agendamentos</h1>
          <p className="text-zinc-500">Gerencie as consultas e horários da clínica</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Buscar por paciente ou dentista..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                  <th className="px-4 lg:px-6 py-4 font-semibold">Data e Hora</th>
                  <th className="px-4 lg:px-6 py-4 font-semibold">Paciente</th>
                  <th className="px-4 lg:px-6 py-4 font-semibold">Dentista</th>
                  <th className="px-4 lg:px-6 py-4 font-semibold">Status</th>
                  <th className="px-4 lg:px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="px-4 lg:px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                          <Calendar className="h-3 w-3 text-emerald-500" />
                          {new Date(apt.date).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <Clock className="h-3 w-3" />
                          {apt.time}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 shrink-0">
                          {getPatientName(apt.patientId).charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-900 truncate max-w-[120px] sm:max-w-none">{getPatientName(apt.patientId)}</span>
                          <button 
                            onClick={() => handleShowAnamnesis(apt.patientId)}
                            className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <Stethoscope className="h-2.5 w-2.5" />
                            Ver Anamnese
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <UserRound className="h-3 w-3 text-zinc-400" />
                        <span className="truncate max-w-[100px] sm:max-w-none">{getDentistName(apt.dentistId)}</span>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                        statusColors[apt.status]
                      )}>
                        {statusLabels[apt.status]}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openEditModal(apt)}
                              title="Editar"
                            >
                              <UserRound className="h-4 w-4 text-zinc-500" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleWhatsAppReminder(apt)}
                              title="Lembrete WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4 text-emerald-500" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => onUpdateStatus(apt.id, 'confirmed')}
                              title="Confirmar"
                            >
                              <CheckCircle2 className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => onUpdateStatus(apt.id, 'completed')}
                              title="Concluir"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => onUpdateStatus(apt.id, 'cancelled')}
                              title="Cancelar"
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => onDeleteAppointment(apt.id)}
                          title="Excluir"
                        >
                          <AlertCircle className="h-4 w-4 text-zinc-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAppointments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      Nenhum agendamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden divide-y divide-zinc-100">
            {filteredAppointments.map((apt) => (
              <div key={apt.id} className="p-4 space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                      <Calendar className="h-4 w-4 text-emerald-500" />
                      {new Date(apt.date).toLocaleDateString('pt-BR')} - {apt.time}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <UserRound className="h-3 w-3" />
                      {getDentistName(apt.dentistId)}
                    </div>
                  </div>
                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0',
                    statusColors[apt.status]
                  )}>
                    {statusLabels[apt.status]}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 shrink-0">
                    {getPatientName(apt.patientId).charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-900">{getPatientName(apt.patientId)}</span>
                    <button 
                      onClick={() => handleShowAnamnesis(apt.patientId)}
                      className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <Stethoscope className="h-2.5 w-2.5" />
                      Ver Anamnese
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2 text-xs h-10"
                        onClick={() => openEditModal(apt)}
                      >
                        Editar
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2 text-xs h-10"
                        onClick={() => handleWhatsAppReminder(apt)}
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2 text-xs h-10"
                        onClick={() => onUpdateStatus(apt.id, 'confirmed')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" /> Confirmar
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2 text-xs h-10"
                        onClick={() => onUpdateStatus(apt.id, 'completed')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Concluir
                      </Button>
                    </>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-10 text-zinc-400"
                    onClick={() => onDeleteAppointment(apt.id)}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredAppointments.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-sm">
                Nenhum agendamento encontrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingAppointment(null);
          setErrors({});
          setFormData({ patientId: '', dentistId: '', date: '', time: '', notes: '' });
        }} 
        title={editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Paciente</label>
            <select 
              className={cn(
                "flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                errors.patientId && "border-red-500 focus-visible:ring-red-500"
              )}
              required
              value={formData.patientId}
              onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
            >
              <option value="">Selecione um paciente</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.patientId && <p className="text-xs text-red-500">{errors.patientId}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Dentista</label>
            <select 
              className={cn(
                "flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                errors.dentistId && "border-red-500 focus-visible:ring-red-500"
              )}
              required
              value={formData.dentistId}
              onChange={(e) => setFormData({ ...formData, dentistId: e.target.value })}
            >
              <option value="">Selecione um dentista</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.name} - {d.specialty}</option>
              ))}
            </select>
            {errors.dentistId && <p className="text-xs text-red-500">{errors.dentistId}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="Data" 
              type="date" 
              required 
              value={formData.date}
              error={errors.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
            <Input 
              label="Horário" 
              type="time" 
              required 
              value={formData.time}
              error={errors.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            />
          </div>
          {formData.dentistId && formData.date && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Horários Disponíveis</label>
              {availableSlots.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      className={cn(
                        "px-3 py-1 rounded-lg text-sm border",
                        formData.time === slot ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-zinc-200 text-zinc-700 hover:border-emerald-500"
                      )}
                      onClick={() => setFormData({ ...formData, time: slot })}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-red-500">Nenhum horário disponível para esta data.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Observações</label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => {
              setIsModalOpen(false);
              setEditingAppointment(null);
            }}>
              Cancelar
            </Button>
            <Button type="submit">
              {editingAppointment ? "Salvar Alterações" : "Agendar Consulta"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAnamnesisModalOpen}
        onClose={() => setIsAnamnesisModalOpen(false)}
        title={`Anamnese - ${selectedPatient?.name}`}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 min-h-[150px]">
            {selectedPatient?.anamnesis ? (
              <p className="text-sm text-zinc-600 whitespace-pre-wrap">{selectedPatient.anamnesis}</p>
            ) : (
              <p className="text-sm text-zinc-400 italic">Nenhuma anamnese registrada para este paciente.</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setIsAnamnesisModalOpen(false)}>Fechar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
