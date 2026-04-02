import React, { useState } from 'react';
import { Dentist, Appointment, Patient, DentistSchedule } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { Calendar, Clock, UserRound, Plus, ChevronLeft, ChevronRight, Settings, Trash2, Lock, Unlock } from 'lucide-react';
import { parseDate, formatDateLocal } from '../lib/dateUtils';
import { cn } from '../lib/utils';

interface DentistScheduleManagerProps {
  dentists: Dentist[];
  appointments: Appointment[];
  patients: Patient[];
  schedules: DentistSchedule[];
  onAddAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void;
  onUpdateSchedules: (schedules: DentistSchedule[]) => void;
}

export function DentistScheduleManager({ 
  dentists, 
  appointments, 
  patients, 
  schedules,
  onAddAppointment,
  onUpdateSchedules
}: DentistScheduleManagerProps) {
  const [selectedDentistId, setSelectedDentistId] = useState<string>(dentists[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(formatDateLocal(new Date()));
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('list');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('day');
  
  const [appointmentFormData, setAppointmentFormData] = useState({
    patientId: '',
    notes: '',
  });

  const selectedDentist = dentists.find(d => d.id === selectedDentistId);
  const dentistAppointments = appointments.filter(a => a.dentistId === selectedDentistId);
  const dentistSchedules = schedules.filter(s => s.dentistId === selectedDentistId);

  const getFilteredAppointments = () => {
    if (calendarView === 'day') {
      return dentistAppointments.filter(a => a.date === selectedDate);
    } else if (calendarView === 'week') {
      const d = parseDate(selectedDate);
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return dentistAppointments.filter(a => {
        const ad = parseDate(a.date);
        return ad >= start && ad <= end;
      });
    } else { // month
      const d = parseDate(selectedDate);
      return dentistAppointments.filter(a => {
        const ad = parseDate(a.date);
        return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear();
      });
    }
  };

  const filteredAppointments = getFilteredAppointments();

  const selectedDayOfWeek = parseDate(selectedDate).getDay();
  const currentDaySchedule = dentistSchedules.find(s => s.dayOfWeek === selectedDayOfWeek);

  // Generate time slots based on schedule settings
  const generateTimeSlots = (start = '08:00', end = '18:00', duration = 30) => {
    const slots = [];
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    let currentHour = startHour;
    let currentMin = startMin;
    
    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      const time = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
      slots.push(time);
      
      currentMin += duration;
      while (currentMin >= 60) {
        currentMin -= 60;
        currentHour += 1;
      }
    }
    return slots;
  };

  const timeSlots = currentDaySchedule 
    ? generateTimeSlots(currentDaySchedule.startTime, currentDaySchedule.endTime, currentDaySchedule.slotDuration)
    : [];

  const getAppointmentAt = (time: string) => {
    return dentistAppointments.find(a => a.time === time && a.status !== 'cancelled');
  };

  const handleBlockSlot = (time: string) => {
    onAddAppointment({
      patientId: 'blocked',
      dentistId: selectedDentistId,
      date: selectedDate,
      time: time,
      status: 'blocked',
      notes: 'Horário Bloqueado Manualmente',
    });
  };

  const getPatientName = (id: string) => patients.find(p => p.id === id)?.name || 'Paciente';

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!appointmentFormData.patientId) newErrors.patientId = 'Selecione um paciente';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTimeSlot || !validate()) return;

    onAddAppointment({
      patientId: appointmentFormData.patientId,
      dentistId: selectedDentistId,
      date: selectedDate,
      time: selectedTimeSlot,
      status: 'scheduled',
      notes: appointmentFormData.notes,
    });

    setIsAppointmentModalOpen(false);
    setAppointmentFormData({ patientId: '', notes: '' });
    setSelectedTimeSlot(null);
    setErrors({});
  };

  const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const handleUpdateScheduleField = (id: string, field: keyof DentistSchedule, value: any) => {
    onUpdateSchedules(schedules.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestão de Agenda</h1>
          <p className="text-zinc-500">Configure horários e gerencie consultas por dentista</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsScheduleModalOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" />
            Configurar Horários
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Dentist Selector */}
        <Card className="md:col-span-1 border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Dentistas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {dentists.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDentistId(d.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                  selectedDentistId === d.id 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                    : "hover:bg-zinc-100 text-zinc-600"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                  selectedDentistId === d.id ? "bg-white/20" : "bg-zinc-100"
                )}>
                  {d.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{d.name}</p>
                  <p className={cn(
                    "text-[10px] truncate",
                    selectedDentistId === d.id ? "text-white/80" : "text-zinc-400"
                  )}>{d.specialty}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Agenda View */}
        <div className="md:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  const d = parseDate(selectedDate);
                  d.setDate(d.getDate() - (calendarView === 'week' ? 7 : calendarView === 'month' ? 30 : 1));
                  setSelectedDate(formatDateLocal(d));
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex flex-col items-center min-w-[150px]">
                <span className="text-sm font-bold text-zinc-900 text-center">
                  {parseDate(selectedDate).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <input 
                  type="date" 
                  className="text-[10px] text-zinc-400 bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-center"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => {
                  const d = parseDate(selectedDate);
                  d.setDate(d.getDate() + (calendarView === 'week' ? 7 : calendarView === 'month' ? 30 : 1));
                  setSelectedDate(formatDateLocal(d));
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <div className="flex bg-zinc-100 rounded-lg p-1">
                <button onClick={() => setDisplayMode('list')} className={`px-3 py-1 text-xs font-bold rounded-md ${displayMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Lista</button>
                <button onClick={() => setDisplayMode('calendar')} className={`px-3 py-1 text-xs font-bold rounded-md ${displayMode === 'calendar' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Calendário</button>
              </div>
              {displayMode === 'calendar' && (
                <div className="flex bg-zinc-100 rounded-lg p-1">
                  <button onClick={() => setCalendarView('day')} className={`px-3 py-1 text-xs font-bold rounded-md ${calendarView === 'day' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Dia</button>
                  <button onClick={() => setCalendarView('week')} className={`px-3 py-1 text-xs font-bold rounded-md ${calendarView === 'week' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Sem</button>
                  <button onClick={() => setCalendarView('month')} className={`px-3 py-1 text-xs font-bold rounded-md ${calendarView === 'month' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Mês</button>
                </div>
              )}
            </div>
          </div>

          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {displayMode === 'list' ? (
                <div className="divide-y divide-zinc-100">
                  {timeSlots.length > 0 ? (
                    timeSlots.map(time => {
                      const appointment = getAppointmentAt(time);
                      return (
                        <div key={time} className="flex items-stretch group min-h-[64px]">
                          <div className="w-20 flex items-center justify-center border-r border-zinc-100 bg-zinc-50/50 text-xs font-bold text-zinc-400">
                            {time}
                          </div>
                          <div className="flex-1 p-2 relative">
                            {appointment ? (
                              <div className={cn(
                                "h-full rounded-xl p-3 flex items-center justify-between transition-all",
                                appointment.status === 'confirmed' ? "bg-blue-50 border border-blue-100" :
                                appointment.status === 'completed' ? "bg-emerald-50 border border-emerald-100" :
                                appointment.status === 'blocked' ? "bg-zinc-100 border border-zinc-200 opacity-75" :
                                "bg-zinc-50 border border-zinc-100"
                              )}>
                                <div className="flex items-center gap-3">
                                  {appointment.status === 'blocked' ? (
                                    <div className="h-8 w-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500">
                                      <Lock className="h-4 w-4" />
                                    </div>
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-xs font-bold text-zinc-600 shadow-sm">
                                      {getPatientName(appointment.patientId).charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <p className={cn(
                                      "text-sm font-bold",
                                      appointment.status === 'blocked' ? "text-zinc-500" : "text-zinc-900"
                                    )}>
                                      {appointment.status === 'blocked' ? 'Horário Bloqueado' : getPatientName(appointment.patientId)}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{appointment.notes || (appointment.status === 'blocked' ? 'Indisponível' : 'Consulta de rotina')}</p>
                                  </div>
                                </div>
                                <span className={cn(
                                  "text-[10px] font-bold uppercase px-2 py-1 rounded-full",
                                  appointment.status === 'confirmed' ? "bg-blue-100 text-blue-600" :
                                  appointment.status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                                  appointment.status === 'blocked' ? "bg-zinc-200 text-zinc-500" :
                                  "bg-zinc-200 text-zinc-600"
                                )}>
                                  {appointment.status === 'blocked' ? 'Bloqueado' : appointment.status}
                                </span>
                              </div>
                            ) : (
                              <div className="flex gap-2 h-full">
                                <button 
                                  onClick={() => {
                                    setSelectedTimeSlot(time);
                                    setIsAppointmentModalOpen(true);
                                  }}
                                  className="flex-1 h-full rounded-xl border-2 border-dashed border-transparent hover:border-emerald-200 hover:bg-emerald-50/50 flex items-center justify-center text-zinc-300 hover:text-emerald-500 transition-all group"
                                >
                                  <Plus className="h-5 w-5 opacity-0 group-hover:opacity-100" />
                                  <span className="text-xs font-medium ml-2 opacity-0 group-hover:opacity-100">Agendar {time}</span>
                                </button>
                                <button 
                                  onClick={() => handleBlockSlot(time)}
                                  className="px-4 h-full rounded-xl border-2 border-dashed border-transparent hover:border-zinc-200 hover:bg-zinc-50 flex items-center justify-center text-zinc-300 hover:text-zinc-500 transition-all group"
                                  title="Bloquear Horário"
                                >
                                  <Lock className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-12 text-center">
                      <Clock className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
                      <p className="text-zinc-500">Nenhum horário de atendimento configurado para este dia.</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => setIsScheduleModalOpen(true)}
                      >
                        Configurar Horários
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6">
                  {calendarView === 'day' ? (
                    <div className="space-y-2">
                      {filteredAppointments.length > 0 ? filteredAppointments.map(apt => (
                        <div key={apt.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 flex items-center justify-between">
                          <span className="font-bold text-zinc-900">{apt.time}</span>
                          <span className="text-sm text-zinc-600">{getPatientName(apt.patientId)}</span>
                        </div>
                      )) : <div className="text-center py-12 text-zinc-500">Nenhum agendamento para este dia.</div>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-2">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                        <div key={day} className="text-center text-xs font-bold text-zinc-500 py-2">{day}</div>
                      ))}
                      {calendarView === 'week' ? (
                        (() => {
                          const startOfWeek = parseDate(selectedDate);
                          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
                          const days = Array.from({ length: 7 }, (_, i) => {
                            const d = new Date(startOfWeek);
                            d.setDate(startOfWeek.getDate() + i);
                            return d;
                          });
                          const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 to 21:00

                          return (
                            <div className="col-span-7 w-full overflow-x-auto border border-zinc-200 rounded-lg bg-white mt-4">
                              <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] min-w-[900px]">
                                {/* Header */}
                                <div className="border-b border-r border-zinc-200 p-2"></div>
                                {days.map(d => (
                                  <div key={d.toISOString()} className="border-b border-r border-zinc-200 p-2 text-center">
                                    <div className="text-xs font-bold text-zinc-500 uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                                    <div className="text-lg font-bold text-zinc-900">{d.getDate()}</div>
                                  </div>
                                ))}
                                
                                {/* Time Grid */}
                                {hours.map(hour => (
                                  <React.Fragment key={hour}>
                                    <div className="border-b border-r border-zinc-200 p-2 text-xs text-zinc-400 text-right pr-2">
                                      {`${String(hour).padStart(2, '0')}:00`}
                                    </div>
                                    {days.map(d => {
                                      const dateStr = formatDateLocal(d);
                                      const apts = dentistAppointments.filter(a => a.date === dateStr && parseInt(a.time.split(':')[0]) === hour);
                                      return (
                                        <div key={d.toISOString() + hour} className="border-b border-r border-zinc-200 min-h-[60px] p-1 relative">
                                          {apts.map(apt => (
                                            <div key={apt.id} className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded truncate cursor-pointer hover:opacity-80">
                                              {apt.time} {getPatientName(apt.patientId)}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        // Month view simplified
                        Array.from({ length: 30 }, (_, i) => {
                          const d = parseDate(selectedDate);
                          d.setDate(i + 1);
                          const dateStr = formatDateLocal(d);
                          const apts = dentistAppointments.filter(a => a.date === dateStr);
                          return (
                            <div key={i} className="min-h-[80px] p-2 border border-zinc-100 rounded-lg">
                              <div className="text-sm font-bold text-zinc-900">{i + 1}</div>
                              <div className="space-y-1 mt-1">
                                {apts.slice(0, 2).map(apt => (
                                  <div key={apt.id} className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded truncate">{apt.time} {getPatientName(apt.patientId)}</div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Appointment Modal */}
      <Modal 
        isOpen={isAppointmentModalOpen} 
        onClose={() => {
          setIsAppointmentModalOpen(false);
          setErrors({});
        }} 
        title={`Novo Agendamento - ${selectedTimeSlot}`}
      >
        <form onSubmit={handleAddAppointment} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Paciente</label>
            <select 
              className={cn(
                "flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                errors.patientId && "border-red-500 focus-visible:ring-red-500"
              )}
              required
              value={appointmentFormData.patientId}
              onChange={(e) => setAppointmentFormData({ ...appointmentFormData, patientId: e.target.value })}
            >
              <option value="">Selecione um paciente</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.patientId && <p className="text-xs text-red-500">{errors.patientId}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Observações</label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={appointmentFormData.notes}
              onChange={(e) => setAppointmentFormData({ ...appointmentFormData, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsAppointmentModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Confirmar Agendamento
            </Button>
          </div>
        </form>
      </Modal>

      {/* Schedule Settings Modal */}
      <Modal 
        isOpen={isScheduleModalOpen} 
        onClose={() => setIsScheduleModalOpen(false)} 
        title={`Configurar Horários - ${selectedDentist?.name}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">Defina os dias e horários de atendimento semanal deste dentista.</p>
          
          <div className="space-y-3">
            {daysOfWeek.map((day, index) => {
              const schedule = dentistSchedules.find(s => s.dayOfWeek === index);
              return (
                <div key={day} className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-700">{day}</span>
                    <div className="flex items-center gap-2">
                      {schedule ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 h-8 gap-2"
                          onClick={() => onUpdateSchedules(schedules.filter(s => s.id !== schedule.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                          Desativar
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-emerald-600 h-8"
                          onClick={() => {
                            const newSchedule: DentistSchedule = {
                              id: Math.random().toString(36).substr(2, 9),
                              dentistId: selectedDentistId,
                              dayOfWeek: index,
                              startTime: '08:00',
                              endTime: '18:00',
                              slotDuration: 30
                            };
                            onUpdateSchedules([...schedules, newSchedule]);
                          }}
                        >
                          Ativar Dia
                        </Button>
                      )}
                    </div>
                  </div>

                  {schedule && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Início</label>
                        <input 
                          type="time" 
                          className="w-full text-xs p-2 rounded-lg border border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500"
                          value={schedule.startTime}
                          onChange={(e) => handleUpdateScheduleField(schedule.id, 'startTime', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Fim</label>
                        <input 
                          type="time" 
                          className="w-full text-xs p-2 rounded-lg border border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500"
                          value={schedule.endTime}
                          onChange={(e) => handleUpdateScheduleField(schedule.id, 'endTime', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Duração (min)</label>
                        <select 
                          className="w-full text-xs p-2 rounded-lg border border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500"
                          value={schedule.slotDuration}
                          onChange={(e) => handleUpdateScheduleField(schedule.id, 'slotDuration', Number(e.target.value))}
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => setIsScheduleModalOpen(false)}>Salvar e Fechar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
