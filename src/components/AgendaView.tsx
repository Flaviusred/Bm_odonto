import React, { useState } from 'react';
import { Appointment, Patient, Dentist, DentistSchedule } from '../types';
import { Button } from './Button';
import { Card, CardContent } from './Card';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Search, UserRound, MessageCircle, CheckCircle2, XCircle, AlertCircle, Stethoscope, Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from './Modal';
import { Input } from './Input';
import { cn } from '../lib/utils';
import { parseDate, formatDateLocal } from '../lib/dateUtils';

interface AgendaViewProps {
  appointments: Appointment[];
  patients: Patient[];
  dentists: Dentist[];
  schedules: DentistSchedule[];
  onAddAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void;
  onUpdateStatus: (id: string, status: Appointment['status']) => void;
  onUpdateAppointment: (appointment: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
  initialDentistId?: string;
}

export function AgendaView({
  appointments,
  patients,
  dentists,
  schedules,
  onAddAppointment,
  onUpdateStatus,
  onUpdateAppointment,
  onDeleteAppointment,
  initialDentistId = 'all',
}: AgendaViewProps) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('list');
  const [selectedDentistId, setSelectedDentistId] = useState<string>(initialDentistId);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedMobileDay, setExpandedMobileDay] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
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

    const date = parseDate(apt.date).toLocaleDateString('pt-BR');
    const message = `Olá ${patient.name}, este é um lembrete da sua consulta na OdontoClinic com ${getDentistName(apt.dentistId)} no dia ${date} às ${apt.time}.`;
    const phone = patient.phone.replace(/\D/g, '');
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

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

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.patientId) newErrors.patientId = 'Selecione um paciente';
    if (!formData.dentistId) newErrors.dentistId = 'Selecione um dentista';
    if (!formData.date) newErrors.date = 'Data é obrigatória';
    if (!formData.time) newErrors.time = 'Horário é obrigatório';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
    scheduled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    confirmed: 'bg-blue-100 text-blue-600 border-blue-200',
    cancelled: 'bg-red-100 text-red-600 border-red-200',
    completed: 'bg-emerald-100 text-emerald-600 border-emerald-200',
    blocked: 'bg-zinc-200 text-zinc-700 border-zinc-300',
  };

  const statusBorderColors = {
    scheduled: 'border-l-zinc-300',
    confirmed: 'border-l-blue-400',
    cancelled: 'border-l-red-400',
    completed: 'border-l-emerald-400',
    blocked: 'border-l-zinc-600',
  };

  const statusLabels = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
    blocked: 'Bloqueado',
  };

  const navigate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (view === 'day') newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    else if (view === 'week') newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    else if (view === 'month') newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
    setExpandedMobileDay(null);
  };

  const getFilteredAppointments = () => {
    return appointments.filter(apt => {
      const aptDate = parseDate(apt.date);
      const matchesDentist = selectedDentistId === 'all' || apt.dentistId === selectedDentistId;
      
      if (!matchesDentist) return false;

      if (view === 'day') {
        return aptDate.toDateString() === currentDate.toDateString();
      } else if (view === 'week') {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return aptDate >= startOfWeek && aptDate <= endOfWeek;
      } else if (view === 'month') {
        return aptDate.getMonth() === currentDate.getMonth() && aptDate.getFullYear() === currentDate.getFullYear();
      }
      return true;
    });
  };

  const filteredAppointments = getFilteredAppointments();

  const CalendarGrid = () => {
    if (view === 'month') {
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
      const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const blanks = Array.from({ length: firstDay }, (_, i) => i);

      return (
        <>
          {/* Desktop Grid View */}
          <div className="hidden md:block overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[600px]">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-500 py-2">{day}</div>
              ))}
              {blanks.map(b => <div key={`blank-${b}`} />)}
              {days.map(day => {
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const apts = appointments.filter(a => a.date === dateStr && (selectedDentistId === 'all' || a.dentistId === selectedDentistId));
                return (
                  <div key={day} className="min-h-[80px] p-2 border border-zinc-100 rounded-lg hover:bg-zinc-50 cursor-pointer" onClick={() => { setCurrentDate(new Date(dateStr)); setView('day'); setDisplayMode('list'); }}>
                    <div className="text-sm font-bold text-zinc-900">{day}</div>
                    <div className="space-y-1 mt-1">
                      {apts.slice(0, 3).map(apt => (
                        <div 
                          key={apt.id} 
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border truncate font-medium",
                            statusColors[apt.status]
                          )}
                        >
                          {apt.time} {getPatientName(apt.patientId)}
                        </div>
                      ))}
                      {apts.length > 3 && <div className="text-[10px] text-zinc-400 pl-1">+{apts.length - 3} mais</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Mobile List View */}
          <div className="md:hidden space-y-2">
            {days.map(day => {
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const apts = appointments.filter(a => a.date === dateStr && (selectedDentistId === 'all' || a.dentistId === selectedDentistId));
              const isExpanded = expandedMobileDay === day;
              
              return (
                <div key={day} className="border border-zinc-100 rounded-lg bg-white overflow-hidden">
                  <div 
                    className={cn(
                      "p-3 flex justify-between items-center transition-colors",
                      apts.length > 0 ? "cursor-pointer active:bg-zinc-50" : "opacity-50"
                    )}
                    onClick={() => {
                      if (apts.length > 0) {
                        setExpandedMobileDay(isExpanded ? null : day);
                      }
                    }}
                  >
                    <span className="font-bold text-zinc-900">{day}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{apts.length} agendamentos</span>
                      {apts.length > 0 && (
                        isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && apts.length > 0 && (
                    <div className="border-t border-zinc-100 bg-zinc-50 p-2 space-y-2">
                      {apts.map(apt => (
                        <div 
                          key={apt.id} 
                          className={cn(
                            "p-2 bg-white rounded border-l-2 shadow-sm flex flex-col gap-1",
                            statusBorderColors[apt.status]
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(apt);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-zinc-900 text-sm">{apt.time}</span>
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                              statusColors[apt.status]
                            )}>
                              {statusLabels[apt.status]}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 truncate">{getPatientName(apt.patientId)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      );
    } else if (view === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return d;
      });
      const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 to 21:00

      return (
        <div className="w-full max-w-[calc(100vw-16px)] sm:max-w-full overflow-x-auto border border-zinc-200 rounded-lg bg-white relative">
          <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] min-w-[900px]">
            {/* Header */}
            <div className="border-b border-r border-zinc-200 p-2 sticky left-0 bg-white z-20"></div>
            {days.map(d => (
              <div key={d.toISOString()} className="border-b border-r border-zinc-200 p-2 text-center">
                <div className="text-xs font-bold text-zinc-500 uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                <div className="text-lg font-bold text-zinc-900">{d.getDate()}</div>
              </div>
            ))}
            
            {/* Time Grid */}
            {hours.map(hour => (
              <React.Fragment key={hour}>
                <div className="border-b border-r border-zinc-200 p-2 text-xs text-zinc-400 text-right pr-2 sticky left-0 bg-white z-10">
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
                {days.map(d => {
                  const dateStr = formatDateLocal(d);
                  const apts = appointments.filter(a => a.date === dateStr && parseInt(a.time.split(':')[0]) === hour && (selectedDentistId === 'all' || a.dentistId === selectedDentistId));
                  return (
                    <div key={d.toISOString() + hour} className="border-b border-r border-zinc-200 min-h-[60px] p-1 relative">
                      {apts.map(apt => (
                        <div 
                          key={apt.id} 
                          className={cn(
                            "text-[10px] p-1 rounded border truncate font-medium cursor-pointer hover:opacity-80 mb-1",
                            statusColors[apt.status]
                          )}
                          onClick={() => openEditModal(apt)}
                        >
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
    } else {
      // day view
      const dateStr = formatDateLocal(currentDate);
      const apts = appointments.filter(a => a.date === dateStr && (selectedDentistId === 'all' || a.dentistId === selectedDentistId));
      return (
        <div className="space-y-2">
          {apts.length > 0 ? apts.map(apt => (
            <div 
              key={apt.id} 
              className={cn(
                "p-3 bg-white rounded-lg border border-zinc-100 border-l-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-2",
                statusBorderColors[apt.status]
              )}
            >
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="font-bold text-zinc-900 whitespace-nowrap">{apt.time}</span>
                <span className="text-sm text-zinc-600 truncate">{getPatientName(apt.patientId)}</span>
              </div>
              <div className="flex justify-end w-full sm:w-auto">
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
                  statusColors[apt.status]
                )}>
                  {statusLabels[apt.status]}
                </span>
              </div>
            </div>
          )) : <div className="text-center py-12 text-zinc-500">Nenhum agendamento para este dia.</div>}
        </div>
      );
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* HEADER SECTION - MOBILE OPTIMIZED */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-3 w-full">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold text-zinc-900">Agenda</h1>
              <p className="text-sm text-zinc-500">Visualização de consultas</p>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
              {Object.entries(statusLabels).map(([key, label]) => (
                <div 
                  key={key} 
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider border", 
                    statusColors[key as keyof typeof statusColors]
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="sm:hidden w-full">
            <Button 
              className="w-full h-10 flex items-center justify-center gap-2"
              onClick={() => {
                setFormData({ patientId: '', dentistId: '', date: '', time: '', notes: '' });
                setIsModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Novo Agendamento</span>
            </Button>
          </div>
        </div>

        {/* Scrollable Filters Row for Mobile */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full">
          <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200 w-full sm:w-auto sm:flex-1">
            <select 
              className="h-9 w-full px-2 sm:px-3 rounded-lg text-sm focus-visible:outline-none bg-transparent"
              value={selectedDentistId}
              onChange={(e) => setSelectedDentistId(e.target.value)}
            >
              <option value="all">Todos os Dentistas</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200 flex-1 sm:flex-none justify-center">
            {(['list', 'calendar'] as const).map((m) => (
              <Button
                key={m}
                variant={displayMode === m ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setDisplayMode(m)}
                className="capitalize px-3 flex-1 sm:flex-none"
              >
                {m === 'list' ? 'Lista' : 'Grade'}
              </Button>
            ))}
          </div>
          <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200 flex-1 sm:flex-none justify-center">
            {(['day', 'week', 'month'] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setView(v)}
                className="capitalize px-3 flex-1 sm:flex-none"
              >
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
              </Button>
            ))}
          </div>
          <div className="hidden sm:flex shrink-0 ml-auto">
            <Button onClick={() => {
              setFormData({ patientId: '', dentistId: '', date: '', time: '', notes: '' });
              setIsModalOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden w-full max-w-full">
        <CardContent className="p-2 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <Button variant="ghost" size="icon" onClick={() => navigate('prev')}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 capitalize min-w-[140px] text-center">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => navigate('next')}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto"
              onClick={() => {
              setFormData({ patientId: '', dentistId: '', date: formatDateLocal(new Date()), time: '', notes: '' });
              setIsModalOpen(true);
            }}>
              Agendar Para Hoje
            </Button>
          </div>
          
          {displayMode === 'list' ? (
            <div className="grid grid-cols-1 gap-3">
              {filteredAppointments.map(apt => (
                <div 
                  key={apt.id} 
                  className={cn(
                    "p-3 sm:p-4 bg-white rounded-xl border border-zinc-100 border-l-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:shadow-md",
                    statusBorderColors[apt.status]
                  )}
                >
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-bold text-zinc-900 text-sm sm:text-base">
                        {parseDate(apt.date).toLocaleDateString('pt-BR')} - {apt.time}
                      </p>
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        statusColors[apt.status]
                      )}>
                        {statusLabels[apt.status]}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-600 truncate w-full">Paciente: {getPatientName(apt.patientId)}</p>
                    <p className="text-xs sm:text-sm text-zinc-600 truncate w-full">Dentista: {getDentistName(apt.dentistId)}</p>
                  </div>
                  
                  {/* Action Buttons Container - Wraps safely on mobile */}
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full sm:w-auto justify-start sm:justify-end pt-2 sm:pt-0 border-t sm:border-transparent border-zinc-100 mt-1 sm:mt-0">
                    {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(apt)} title="Editar"><UserRound className="h-4 w-4 text-zinc-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWhatsAppReminder(apt)} title="Lembrete WhatsApp"><MessageCircle className="h-4 w-4 text-emerald-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onUpdateStatus(apt.id, 'confirmed')} title="Confirmar"><CheckCircle2 className="h-4 w-4 text-blue-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onUpdateStatus(apt.id, 'completed')} title="Concluir"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onUpdateStatus(apt.id, 'cancelled')} title="Cancelar"><XCircle className="h-4 w-4 text-red-500" /></Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto sm:ml-0" onClick={() => onDeleteAppointment(apt.id)} title="Excluir"><AlertCircle className="h-4 w-4 text-zinc-400" /></Button>
                  </div>
                </div>
              ))}
              {filteredAppointments.length === 0 && (
                <div className="text-center py-12 text-sm text-zinc-500">Nenhum agendamento encontrado para este período.</div>
              )}
            </div>
          ) : (
            <CalendarGrid />
          )}
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
                "flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
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
                "flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
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
            
            {formData.dentistId && (
              <div className="mt-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-xs text-zinc-600">
                <p className="font-bold text-zinc-800 mb-1">Horários de Atendimento:</p>
                {schedules.filter(s => s.dentistId === formData.dentistId).map(s => (
                  <div key={s.id} className="flex justify-between">
                    <span>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][s.dayOfWeek]}:</span>
                    <span>{s.startTime} - {s.endTime}</span>
                  </div>
                ))}
                {schedules.filter(s => s.dentistId === formData.dentistId).length === 0 && <p>Nenhum horário definido.</p>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="Data" 
              type="date" 
              required 
              value={formData.date}
              error={errors.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value, time: '' })}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Horário</label>
              {formData.dentistId && formData.date ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {(() => {
                    const date = parseDate(formData.date);
                    const dayOfWeek = date.getDay();
                    const schedule = schedules.find(s => s.dentistId === formData.dentistId && s.dayOfWeek === dayOfWeek);
                    
                    if (!schedule) {
                      return (
                        <div className="col-span-3 sm:col-span-4 mt-1">
                          <p className="text-xs text-zinc-500 mb-2">Dentista não atende neste dia. Insira o horário manualmente:</p>
                          <Input 
                            type="time" 
                            required 
                            value={formData.time}
                            error={errors.time}
                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                          />
                        </div>
                      );
                    }
                    
                    const slots = [];
                    let [startH, startM] = schedule.startTime.split(':').map(Number);
                    let [endH, endM] = schedule.endTime.split(':').map(Number);
                    let current = startH * 60 + startM;
                    const end = endH * 60 + endM;
                    
                    while (current + schedule.slotDuration <= end) {
                      const h = Math.floor(current / 60);
                      const m = current % 60;
                      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                      const isBooked = appointments.some(a => a.dentistId === formData.dentistId && a.date === formData.date && a.time === timeStr && a.status !== 'cancelled' && a.id !== editingAppointment?.id);
                      if (!isBooked) slots.push(timeStr);
                      current += schedule.slotDuration;
                    }
                    
                    return slots.length > 0 ? slots.map(time => (
                      <Button
                        key={time}
                        type="button"
                        variant={formData.time === time ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setFormData({ ...formData, time })}
                        className="px-1 py-2 text-xs h-auto"
                      >
                        {time}
                      </Button>
                    )) : <p className="text-xs text-zinc-500 col-span-3 sm:col-span-4">Sem horários disponíveis.</p>;
                  })()}
                </div>
              ) : (
                <Input 
                  type="time" 
                  required 
                  value={formData.time}
                  error={errors.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              )}
              {errors.time && <p className="text-xs text-red-500">{errors.time}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Observações</label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => {
              setIsModalOpen(false);
              setEditingAppointment(null);
            }}>
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto">
              {editingAppointment ? "Salvar Alterações" : "Agendar Consulta"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
