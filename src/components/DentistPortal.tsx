import React, { useState, useEffect } from 'react';
import { User, Patient, Appointment, Dentist, Treatment, PatientDocument } from '../types';
import { formatDateDDMMYYYY, parseDate, formatDateLocal } from '../lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { 
  Calendar, 
  Stethoscope, 
  UserRound, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Upload, 
  Plus, 
  Search, 
  History,
  FileUp,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ChevronLeft,
  Bell
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Toaster, toast } from 'sonner';

const PDF_MAX_MB = 5;
const RECORD_IMAGE_MAX_MB = 3;
const PDF_MAX_BYTES = PDF_MAX_MB * 1024 * 1024;
const RECORD_IMAGE_MAX_BYTES = RECORD_IMAGE_MAX_MB * 1024 * 1024;
const RECORD_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

interface DentistPortalProps {
  activeTab: string;
  onTabChange?: (tab: string) => void;
  dentist: Dentist;
  patients: Patient[];
  appointments: Appointment[];
  dentists: Dentist[];
  treatments: Treatment[];
  documents: PatientDocument[];
  onAddAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void;
  onAddTreatment: (treatment: Omit<Treatment, 'id' | 'createdAt'>) => void;
  onUpdateTreatment: (treatment: Treatment) => void;
  onAddDocument: (doc: Omit<PatientDocument, 'id' | 'uploadedAt'>) => void;
  onUpdateAppointmentStatus: (id: string, status: Appointment['status']) => void;
  unseenCount: number;
  setUnseenCount: React.Dispatch<React.SetStateAction<number>>;
  markAllNotificationsRead?: () => Promise<void> | (() => void);
  notifications?: Array<{ id: string; message: string; type: 'info' | 'success'; read?: boolean; appointmentId?: string | null; createdAt?: number; showAsToast?: boolean }>;
  isNotificationsOpen?: boolean;
  toggleNotificationsPanel?: () => void;
  removeNotification?: (id: string) => void;
}

export function DentistPortal({ 
  activeTab, 
  onTabChange,
  dentist, 
  patients, 
  appointments, 
  dentists, 
  treatments,
  documents,
  onAddAppointment,
  onAddTreatment,
  onUpdateTreatment,
  onAddDocument,
  onUpdateAppointmentStatus,
  unseenCount, setUnseenCount,
  markAllNotificationsRead,
  notifications,
  isNotificationsOpen,
  toggleNotificationsPanel,
  removeNotification
}: DentistPortalProps) {
  const dentistId = (dentist as any)?.id || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyGroupBy, setHistoryGroupBy] = useState<'date' | 'dentist'>('date');
  const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [isScheduleNextPromptOpen, setIsScheduleNextPromptOpen] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState<Appointment | null>(null);
  const [appointmentDetail, setAppointmentDetail] = useState<{ apt: Appointment; patient: Patient | null } | null>(null);

  const openAppointmentDetail = (apt: Appointment) => {
    setAppointmentDetail({ apt, patient: patients.find(p => p.id === apt.patientId) || null });
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        window.location.reload(); 
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  

  

  const [treatmentForm, setTreatmentForm] = useState({
    description: '',
    type: 'cleaning' as Treatment['type'],
    date: formatDateLocal(new Date()),
  });

  const [appointmentForm, setAppointmentForm] = useState({
    patientId: '',
    date: '',
    time: '',
    notes: '',
  });

  const [expandedTreatments, setExpandedTreatments] = useState<string[]>([]);
  const [docFilter, setDocFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());

  const CalendarGrid = () => {
    if (view === 'month') {
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
      const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const blanks = Array.from({ length: firstDay }, (_, i) => i);

      return (
        <>
          {/* Desktop Grid View */}
          <div className="hidden md:block w-full overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[600px] w-full">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-500 py-2">{day}</div>
              ))}
              {blanks.map(b => <div key={`blank-${b}`} />)}
              {days.map(day => {
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const apts = myAppointments.filter(a => a.date === dateStr);
                return (
                  <div key={day} className="min-h-[80px] p-2 border border-zinc-100 rounded-lg hover:bg-zinc-50 cursor-pointer" onClick={() => { setCurrentDate(parseDate(dateStr)); setView('day'); setDisplayMode('list'); }}>
                    <div className="text-sm font-bold text-zinc-900">{day}</div>
                    <div className="space-y-1 mt-1">
                      {apts.slice(0, 2).map(apt => (
                        <div key={apt.id} className={cn("text-[10px] px-1 rounded border truncate font-medium cursor-pointer transition-colors", statusClass[apt.status])} onClick={e => { e.stopPropagation(); openAppointmentDetail(apt); }}>
                          {apt.time} {getPatientName(apt.patientId)}
                        </div>
                      ))}
                      {apts.length > 2 && <div className="text-[10px] text-zinc-400 pl-1">+{apts.length - 2} mais</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Mobile List View for Month */}
          <div className="md:hidden space-y-2 mt-4">
            {days.map(day => {
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const apts = myAppointments.filter(a => a.date === dateStr);
              return (
                <div key={day} className="p-3 border border-zinc-100 rounded-lg bg-zinc-50 flex justify-between items-center active:bg-zinc-100 transition-colors" onClick={() => { setCurrentDate(parseDate(dateStr)); setView('day'); setDisplayMode('list'); }}>
                  <span className="font-bold text-zinc-900">{day}</span>
                  <span className="text-xs text-zinc-500 font-medium">{apts.length} atendimentos</span>
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
            {/* Header with sticky left */}
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
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  const apts = myAppointments.filter(a => a.date === dateStr && parseInt(a.time.split(':')[0]) === hour);
                  return (
                    <div key={d.toISOString() + hour} className="border-b border-r border-zinc-200 min-h-[60px] p-1 relative">
                      {apts.map(apt => (
                        <div key={apt.id} className={cn("text-[10px] px-1 py-0.5 rounded border truncate font-medium cursor-pointer transition-colors mb-1", statusClass[apt.status])} onClick={e => { e.stopPropagation(); openAppointmentDetail(apt); }}>
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
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const apts = myAppointments.filter(a => a.date === dateStr);
      return (
        <div className="space-y-2 mt-4">
          {apts.length > 0 ? apts.map(apt => (
            <div key={apt.id} className="p-3 sm:p-4 bg-zinc-50 rounded-lg border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm cursor-pointer hover:bg-zinc-100 transition-colors" onClick={() => openAppointmentDetail(apt)}>
              <span className="font-bold text-zinc-900 text-lg sm:text-base">{apt.time}</span>
              <span className="text-sm font-medium text-emerald-700 truncate underline underline-offset-2 decoration-dotted">{getPatientName(apt.patientId)}</span>
              <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border w-fit', statusClass[apt.status])}>
                {statusLabel[apt.status]}
              </span>
              <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0 hidden sm:block" />
            </div>
          )) : <div className="text-center py-12 text-zinc-500 text-sm">Nenhum agendamento para este dia.</div>}
        </div>
      );
    }
  };

  const toggleTreatment = (id: string) => {
    setExpandedTreatments(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const expandAll = (patientTreatments: Treatment[]) => {
    setExpandedTreatments(patientTreatments.map(t => t.id));
  };

  const collapseAll = () => {
    setExpandedTreatments([]);
  };

  const [uploadForm, setUploadForm] = useState({
    name: '',
    type: 'exam' as PatientDocument['type'],
    file: null as File | null,
  });

  const myAppointments = dentistId ? appointments.filter(a => a.dentistId === dentistId) : [];
  const myTreatments = dentistId ? treatments.filter(t => t.dentistId === dentistId) : [];

  const getPatientName = (id: string) => patients.find(p => p.id === id)?.name || 'Paciente';
  const getDentistName = (id: string) => dentists.find(d => d.id === id)?.name || 'Dentista';

  const statusClass: Partial<Record<Appointment['status'], string>> = {
    scheduled: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    blocked: 'bg-amber-100 text-amber-700 border-amber-200',
  };

  const statusLabel: Partial<Record<Appointment['status'], string>> = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
    blocked: 'Bloqueado',
  };

  const translateType = (type?: string) => {
    const translations: Record<string, string> = {
      'cleaning': 'Limpeza',
      'extraction': 'Extração',
      'filling': 'Obturação',
      'root-canal': 'Canal',
      'orthodontics': 'Ortodontia',
      'other': 'Outro',
      'exam': 'Exame',
      'document': 'Documento',
      'x-ray': 'Raio-X'
    };
    return type ? (translations[type] || type) : 'Geral';
  };

  const handleRegisterTreatment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !currentAppointment) return;

    onAddTreatment({
      patientId: selectedPatient.id,
      dentistId,
      appointmentId: currentAppointment.id,
      ...treatmentForm,
    });

    onUpdateAppointmentStatus(currentAppointment.id, 'completed');
    setIsTreatmentModalOpen(false);
    setTreatmentForm({ description: '', type: 'cleaning', date: formatDateLocal(new Date()) });
    setIsScheduleNextPromptOpen(true);
  };

  const handleScheduleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const pId = selectedPatient?.id || appointmentForm.patientId;
    if (!pId) return;

    onAddAppointment({
      patientId: pId,
      dentistId,
      date: appointmentForm.date,
      time: appointmentForm.time,
      notes: appointmentForm.notes,
      status: 'scheduled',
    });

    setIsAppointmentModalOpen(false);
    setAppointmentForm({ patientId: '', date: '', time: '', notes: '' });
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !uploadForm.file) {
      toast.error('Selecione um arquivo para upload.');
      return;
    }

    // Validation
    if (!RECORD_ALLOWED_TYPES.includes(uploadForm.file.type)) {
      toast.error('Tipo de arquivo inválido. Apenas PDF, JPG ou PNG são permitidos.');
      return;
    }

    const isPdf = uploadForm.file.type === 'application/pdf';
    const maxBytes = isPdf ? PDF_MAX_BYTES : RECORD_IMAGE_MAX_BYTES;
    const maxLabel = isPdf ? `${PDF_MAX_MB}MB` : `${RECORD_IMAGE_MAX_MB}MB`;

    if (uploadForm.file.size > maxBytes) {
      toast.error(`Arquivo muito grande. Limite para este tipo: ${maxLabel}.`);
      return;
    }

    // Simulate file upload
    const fileUrl = URL.createObjectURL(uploadForm.file);

    onAddDocument({
      patientId: selectedPatient.id,
      name: uploadForm.name || uploadForm.file.name,
      type: uploadForm.type,
      url: fileUrl,
    });

    toast.success('Documento enviado com sucesso!');
    setIsUploadModalOpen(false);
    setUploadForm({ name: '', type: 'exam', file: null });
  };

  // Main Content Rendering
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 bg-white border-b border-zinc-200">
        <h1 className="text-xl font-bold">Portal do Dentista</h1>
        <div className="relative">
          <button className="relative" onClick={() => toggleNotificationsPanel?.() } aria-label="Notificações">
            <Bell className="h-6 w-6 text-zinc-600" />
            {(unseenCount > 0) && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {unseenCount}
              </span>
            )}
          </button>

          {/** Panel */}
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-96 max-h-96 overflow-auto bg-white rounded-lg shadow-lg border p-2 z-30">
              <div className="flex items-center justify-between px-2 py-1 border-b">
                <div className="font-bold">Notificações</div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-zinc-500 hover:text-zinc-700" onClick={async () => { await markAllNotificationsRead?.(); setUnseenCount(0); }}>Marcar todas como lidas</button>
                </div>
              </div>
              <div className="divide-y">
                {notifications && notifications.length > 0 ? (
                  notifications.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).map(n => (
                    <div key={n.id} className="px-3 py-2 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-900">{n.message}</div>
                        <div className="text-xs text-zinc-400">{n.createdAt ? new Date(n.createdAt).toLocaleString('pt-BR') : ''}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button className="text-xs text-zinc-500 hover:text-zinc-800" onClick={() => removeNotification?.(n.id)}>Marcar como lida</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-zinc-500">Sem notificações</div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      {/* Patient Record (Prontuário) */}
      {selectedPatient && activeTab === 'dentist-patients' ? (
        <div className="p-4 lg:p-8 space-y-6">
          <Toaster richColors position="top-right" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setSelectedPatient(null)} className="px-2 sm:px-4">
              <ChevronLeft className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Voltar para lista</span>
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate">Prontuário: {selectedPatient.name}</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Patient Info & Anamnesis */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Informações do Paciente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 text-sm text-zinc-600">
                    <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span>Nascimento: {formatDateDDMMYYYY(selectedPatient.birthDate)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-zinc-600">
                    <UserRound className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span>CPF: {selectedPatient.cpf}</span>
                  </div>
                  <div className="pt-4 border-t border-zinc-100">
                    <h4 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 shrink-0" />
                      Anamnese
                    </h4>
                    <p className="text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-100 italic">
                      {selectedPatient.anamnesis || 'Nenhuma anamnese registrada.'}
                    </p>
                  </div>
                  <div className="pt-4 flex flex-col gap-2">
                    <Button onClick={() => setIsHistoryModalOpen(true)} variant="secondary" className="w-full gap-2 text-xs sm:text-sm">
                      <History className="h-4 w-4 shrink-0" /> Ver Histórico Completo
                    </Button>
                    <Button onClick={() => setIsAppointmentModalOpen(true)} className="w-full gap-2 text-xs sm:text-sm">
                      <Plus className="h-4 w-4 shrink-0" /> Agendar Próxima
                    </Button>
                    <Button variant="outline" onClick={() => setIsUploadModalOpen(true)} className="w-full gap-2 text-xs sm:text-sm">
                      <FileUp className="h-4 w-4 shrink-0" /> Upload Documento
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Exames e Documentos</CardTitle>
                  <select 
                    className="text-xs border border-zinc-200 rounded-md p-1"
                    value={docFilter}
                    onChange={e => setDocFilter(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    <option value="exam">Exames</option>
                    <option value="document">Documentos</option>
                    <option value="x-ray">Raio-X</option>
                  </select>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.filter(d => d.patientId === selectedPatient.id && (docFilter === 'all' || d.type === docFilter)).map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                            <div className="truncate">
                              <p className="text-sm font-medium text-zinc-900 truncate">{doc.name}</p>
                              <p className="text-[10px] text-zinc-500 uppercase">{translateType(doc.type)}</p>
                            </div>
                          </div>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline text-xs shrink-0 ml-2">Ver</a>
                        </div>
                  ))}
                  {documents.filter(d => d.patientId === selectedPatient.id && (docFilter === 'all' || d.type === docFilter)).length === 0 && (
                    <p className="text-sm text-zinc-400 italic text-center py-4">Nenhum documento anexado.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Treatment Evolution */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="border-b border-zinc-100 pb-6">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <History className="h-5 w-5 text-emerald-500 shrink-0" />
                        Evolução do Atendimento
                      </CardTitle>
                      <CardDescription>Histórico completo de procedimentos realizados.</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] uppercase font-bold tracking-wider whitespace-nowrap"
                        onClick={() => {
                          const pTreatments = treatments.filter(t => t.patientId === selectedPatient.id);
                          expandedTreatments.length === pTreatments.length ? collapseAll() : expandAll(pTreatments);
                        }}
                      >
                        {expandedTreatments.length === treatments.filter(t => t.patientId === selectedPatient.id).length 
                          ? 'Recolher Tudo' 
                          : 'Expandir Tudo'}
                      </Button>
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <Input 
                          placeholder="Buscar no histórico..." 
                          className="pl-9 h-9 text-sm bg-zinc-50 border-zinc-200 focus:bg-white transition-colors"
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
                    {treatments
                      .filter(t => t.patientId === selectedPatient.id)
                      .filter(t => 
                          (t.description || '').toLowerCase().includes(historySearch.toLowerCase()) ||
                          ((t.type || '').toLowerCase().includes(historySearch.toLowerCase()))
                        )
                      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
                      .map(t => {
                        const isExpanded = expandedTreatments.includes(t.id);
                        return (
                          <div key={t.id} className="hover:bg-zinc-50/50 transition-colors">
                            <button 
                              onClick={() => toggleTreatment(t.id)}
                              className="w-full p-4 sm:p-6 text-left flex justify-between items-start group"
                            >
                              <div className="space-y-1 pr-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">
                                    {translateType(t.type)}
                                  </h4>
                                  <span className="text-xs font-medium text-zinc-400 whitespace-nowrap">
                                    {parseDate(t.date).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-500 line-clamp-1 sm:line-clamp-none">
                                  Realizado por <span className="font-medium text-zinc-700">{getDentistName(t.dentistId)}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 pt-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-5 w-5 text-zinc-400" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-zinc-400" />
                                )}
                              </div>
                            </button>
                            
                            {isExpanded && (
                              <div className="px-4 sm:px-6 pb-6 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="bg-zinc-50 rounded-xl p-3 sm:p-4 border border-zinc-100 shadow-inner">
                                  <p className="text-sm text-zinc-700 leading-relaxed break-words">
                                    {t.description}
                                  </p>
                                  <div className="mt-4 pt-4 border-t border-zinc-200 flex items-center justify-between">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                        {translateType(t.type)}
                                      </span>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-white px-2 py-1 rounded-md border border-zinc-200">
                                        Ref: {t.id.slice(-6)}
                                      </span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingTreatment(t)}>
                                      Editar Data
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {treatments.filter(t => t.patientId === selectedPatient.id).length === 0 && (
                      <div className="p-8 sm:p-12 text-center text-zinc-500 italic text-sm">
                        Nenhum tratamento registrado no histórico.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Appointments Tab */}
          {activeTab === 'dentist-appointments' && (
            <div className="w-full max-w-full overflow-x-hidden p-2 sm:p-4 lg:p-8 space-y-4 lg:space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Meus Agendamentos</h1>
                  <p className="text-xs sm:text-sm text-zinc-500">Confira sua agenda de atendimentos</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <Button onClick={() => {
                    setSelectedPatient(null);
                    setIsAppointmentModalOpen(true);
                  }} className="gap-2 text-xs h-10 w-full lg:w-auto">
                    <Plus className="h-4 w-4" /> Novo Agendamento
                  </Button>
                </div>
              </div>

              <Card className="border-none shadow-sm overflow-hidden w-full max-w-full">
                <CardContent className="p-0">
                  {/* Controls Header - Responsive Scrollable Row */}
                  <div className="flex flex-col gap-4 mb-6 p-4">
                    <div className="flex items-center justify-between">
                       <h2 className="text-lg font-bold text-zinc-900 hidden sm:block">Agenda</h2>
                       
                       {/* Mobile Scrollable View Modes */}
                       <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:pb-0 scrollbar-hide">
                          <div className="flex bg-zinc-100 rounded-lg p-1 shrink-0">
                            <button onClick={() => setDisplayMode('list')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Lista</button>
                            <button onClick={() => setDisplayMode('calendar')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayMode === 'calendar' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Calendário</button>
                          </div>
                          
                          {displayMode === 'calendar' && (
                            <div className="flex bg-zinc-100 rounded-lg p-1 shrink-0">
                              <button onClick={() => setView('day')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'day' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Dia</button>
                              <button onClick={() => setView('week')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'week' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Semana</button>
                              <button onClick={() => setView('month')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'month' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Mês</button>
                            </div>
                          )}
                       </div>
                    </div>
                  </div>

                  {displayMode === 'calendar' ? (
                    <CalendarGrid />
                  ) : (
                    <div className="hidden lg:block overflow-x-auto p-4">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                            <th className="px-4 lg:px-6 py-4 font-semibold">Data e Hora</th>
                            <th className="px-4 lg:px-6 py-4 font-semibold">Paciente</th>
                            <th className="px-4 lg:px-6 py-4 font-semibold">Status</th>
                            <th className="px-4 lg:px-6 py-4 font-semibold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {myAppointments.map((apt) => (
                            <tr key={apt.id} className="hover:bg-zinc-50/50 transition-colors group">
                              <td className="px-4 lg:px-6 py-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                                    <Calendar className="h-3 w-3 text-emerald-500" />
                                    {formatDateDDMMYYYY(apt.date)}
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
                                  <button type="button" className="text-sm font-medium text-emerald-700 hover:underline truncate max-w-[120px] sm:max-w-none text-left" onClick={() => openAppointmentDetail(apt)}>{getPatientName(apt.patientId)}</button>
                                </div>
                              </td>
                              <td className="px-4 lg:px-6 py-4">
                                <span className={cn(
                                  'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border',
                                  statusClass[apt.status]
                                )}>
                                  {statusLabel[apt.status]}
                                </span>
                              </td>
                              <td className="px-4 lg:px-6 py-4 text-right">
                                <div className="flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                  {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                                    <Button 
                                      size="sm" 
                                      className="gap-2"
                                      onClick={() => {
                                        setCurrentAppointment(apt);
                                        setSelectedPatient(patients.find(p => p.id === apt.patientId) || null);
                                        setIsTreatmentModalOpen(true);
                                      }}
                                    >
                                      <CheckCircle2 className="h-4 w-4" /> Concluir Atendimento
                                    </Button>
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedPatient(patients.find(p => p.id === apt.patientId) || null);
                                      onTabChange?.('dentist-patients');
                                    }}
                                  >
                                    Ver Prontuário
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Mobile Card View (List Mode) */}
                  {displayMode !== 'calendar' && (
                    <div className="lg:hidden divide-y divide-zinc-100 p-4">
                      {myAppointments.map((apt) => (
                        <div key={apt.id} className="p-4 bg-white border border-zinc-100 rounded-xl shadow-sm flex flex-col gap-4 mb-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                                <Calendar className="h-4 w-4 text-emerald-500" />
                                {formatDateDDMMYYYY(apt.date)} - {apt.time}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 shrink-0">
                                  {getPatientName(apt.patientId).charAt(0)}
                                </div>
                                <button type="button" className="text-sm font-medium text-emerald-700 hover:underline text-left" onClick={() => openAppointmentDetail(apt)}>{getPatientName(apt.patientId)}</button>
                              </div>
                            </div>
                            <span className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0 border',
                              statusClass[apt.status]
                            )}>
                              {statusLabel[apt.status]}
                            </span>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-50">
                            {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                              <Button 
                                size="sm" 
                                className="flex-1 gap-2 text-xs h-10"
                                onClick={() => {
                                  setCurrentAppointment(apt);
                                  setSelectedPatient(patients.find(p => p.id === apt.patientId) || null);
                                  setIsTreatmentModalOpen(true);
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4" /> Concluir Atendimento
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="flex-1 gap-2 text-xs h-10"
                              onClick={() => {
                                setSelectedPatient(patients.find(p => p.id === apt.patientId) || null);
                                onTabChange?.('dentist-patients');
                              }}
                            >
                              <UserRound className="h-4 w-4" /> Ver Prontuário
                            </Button>
                          </div>
                        </div>
                      ))}
                      {myAppointments.length === 0 && (
                        <div className="p-8 text-center text-zinc-500 text-sm">
                          Nenhum agendamento encontrado.
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Patients Tab (List) */}
          {activeTab === 'dentist-patients' && (
            <div className="p-4 lg:p-8 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Meus Pacientes</h1>
                <p className="text-zinc-500">Acesse o prontuário e histórico dos pacientes</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input 
                  placeholder="Buscar paciente por nome..." 
                  className="pl-10 h-12"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {patients.filter(p => (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map(patient => (
                  <Card key={patient.id} className="border-none shadow-sm hover:ring-2 hover:ring-emerald-500 transition-all cursor-pointer" onClick={() => setSelectedPatient(patient)}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold">
                          {(patient.name || 'Paciente').charAt(0)}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-zinc-900">{patient.name || 'Paciente'}</h3>
                          <p className="text-xs text-zinc-500">{patient.cpf}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-zinc-300" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Treatments Tab (History of performed treatments) */}
          {activeTab === 'dentist-treatments' && (
            <div className="p-4 lg:p-8 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Atendimentos Realizados</h1>
                <p className="text-zinc-500">Histórico de procedimentos que você executou</p>
              </div>

              <div className="space-y-4">
                {myTreatments.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()).map(t => (
                  <Card key={t.id} className="border-none shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <Stethoscope className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-zinc-900">{t.description}</h3>
                            <p className="text-sm text-zinc-500">Paciente: {getPatientName(t.patientId)}</p>
                            <div className="flex items-center gap-4 mt-2">
                                <div className="flex items-center gap-1 text-xs text-zinc-400">
                                <Calendar className="h-3 w-3" />
                                {parseDate(t.date).toLocaleDateString('pt-BR')}
                              </div>
                              {t.type && (
                                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase">
                                  {translateType(t.type)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {myTreatments.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-zinc-200">
                    <AlertCircle className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
                    <p className="text-zinc-500">Você ainda não registrou nenhum atendimento.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Global Modals */}
      <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title={`Histórico de ${selectedPatient?.name}`}>
        <div className="space-y-4 py-4">
          <div className="flex bg-zinc-100 rounded-lg p-1">
            <button onClick={() => setHistoryGroupBy('date')} className={`flex-1 px-3 py-1 text-xs font-bold rounded-md ${historyGroupBy === 'date' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Por Data</button>
            <button onClick={() => setHistoryGroupBy('dentist')} className={`flex-1 px-3 py-1 text-xs font-bold rounded-md ${historyGroupBy === 'dentist' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Por Dentista</button>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {(() => {
              const patientTreatments = treatments.filter(t => t.patientId === selectedPatient?.id);
              if (historyGroupBy === 'date') {
                const grouped = patientTreatments.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()).reduce((acc, t) => {
                  const date = parseDate(t.date).toLocaleDateString('pt-BR');
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(t);
                  return acc;
                }, {} as Record<string, Treatment[]>);
                return Object.entries(grouped).map(([date, ts]) => (
                  <div key={date} className="space-y-2">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase sticky top-0 bg-white py-1">{date}</h4>
                    {ts.map(t => (
                      <div key={t.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 text-sm">
                        <p className="font-bold text-zinc-900">{translateType(t.type)}</p>
                        <p className="text-zinc-600 mt-1">{t.description}</p>
                        <p className="text-[10px] text-zinc-400 mt-2 font-medium">Dentista: {getDentistName(t.dentistId)}</p>
                      </div>
                    ))}
                  </div>
                ));
              } else {
                const grouped = patientTreatments.reduce((acc, t) => {
                  const dentistName = getDentistName(t.dentistId);
                  if (!acc[dentistName]) acc[dentistName] = [];
                  acc[dentistName].push(t);
                  return acc;
                }, {} as Record<string, Treatment[]>);
                return Object.entries(grouped).map(([dentistName, ts]) => (
                  <div key={dentistName} className="space-y-2">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase sticky top-0 bg-white py-1">{dentistName}</h4>
                    {ts.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()).map(t => (
                      <div key={t.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 text-sm">
                        <p className="font-bold text-zinc-900">{translateType(t.type)}</p>
                        <p className="text-zinc-600 mt-1">{t.description}</p>
                        <p className="text-[10px] text-zinc-400 mt-2 font-medium">Data: {parseDate(t.date).toLocaleDateString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                ));
              }
            })()}
            {treatments.filter(t => t.patientId === selectedPatient?.id).length === 0 && (
              <p className="text-center text-zinc-500 text-sm py-8 italic">Nenhum tratamento registrado.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isScheduleNextPromptOpen} onClose={() => setIsScheduleNextPromptOpen(false)} title="Atendimento Finalizado">
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">Atendimento registrado com sucesso!</h3>
            <p className="text-sm text-zinc-500">Deseja deixar agendada uma próxima consulta para <strong>{selectedPatient?.name}</strong>?</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button variant="outline" onClick={() => setIsScheduleNextPromptOpen(false)} className="w-full sm:flex-1 order-2 sm:order-1">
              Não, finalizar
            </Button>
            <Button onClick={() => {
              setIsScheduleNextPromptOpen(false);
              setIsAppointmentModalOpen(true);
            }} className="w-full sm:flex-1 order-1 sm:order-2">
              Sim, agendar agora
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isAppointmentModalOpen} onClose={() => setIsAppointmentModalOpen(false)} title="Agendar Consulta">
        <form onSubmit={handleScheduleNext} className="space-y-4">
          {!selectedPatient && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Paciente</label>
              <select 
                className="flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                required
                value={appointmentForm.patientId}
                onChange={e => setAppointmentForm({...appointmentForm, patientId: e.target.value})}
              >
                <option value="">Selecione um paciente...</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Data" type="date" required value={appointmentForm.date} onChange={e => setAppointmentForm({...appointmentForm, date: e.target.value})} />
            <Input label="Horário" type="time" required value={appointmentForm.time} onChange={e => setAppointmentForm({...appointmentForm, time: e.target.value})} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Observações</label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={appointmentForm.notes}
              onChange={e => setAppointmentForm({...appointmentForm, notes: e.target.value})}
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
             <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsAppointmentModalOpen(false)}>Cancelar</Button>
             <Button type="submit" className="w-full sm:w-auto">Confirmar Agendamento</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload de Documento">
        <form onSubmit={handleUpload} className="space-y-4">
          <Input label="Nome do Documento" required value={uploadForm.name} onChange={e => setUploadForm({...uploadForm, name: e.target.value})} />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Tipo</label>
            <select 
              className="flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={uploadForm.type}
              onChange={e => setUploadForm({...uploadForm, type: e.target.value as any})}
            >
              <option value="exam">Exame</option>
              <option value="document">Documento</option>
              <option value="x-ray">Raio-X</option>
            </select>
          </div>
          <div className="border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-colors" onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="application/pdf,image/jpeg,image/png"
              onChange={e => setUploadForm({...uploadForm, file: e.target.files?.[0] || null})}
            />
            <Upload className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-700">
              {uploadForm.file ? uploadForm.file.name : 'Clique ou arraste o arquivo aqui'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">PDF até 5MB | Imagens (JPG/PNG) até 3MB</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
             <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsUploadModalOpen(false)}>Cancelar</Button>
             <Button type="submit" className="w-full sm:w-auto">Salvar Documento</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isTreatmentModalOpen} onClose={() => setIsTreatmentModalOpen(false)} title="Registrar Atendimento">
        <form onSubmit={handleRegisterTreatment} className="space-y-4">
          <div className="p-3 sm:p-4 rounded-xl bg-emerald-50 border border-emerald-100 mb-2">
            <p className="text-sm font-bold text-emerald-900 truncate">Paciente: {selectedPatient?.name}</p>
              <p className="text-xs text-emerald-700 mt-1">
              Consulta em {currentAppointment ? parseDate(currentAppointment.date).toLocaleDateString('pt-BR') : ''} às {currentAppointment?.time}
            </p>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Tipo de Atendimento</label>
            <select 
              className="flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={treatmentForm.type}
              onChange={e => setTreatmentForm({...treatmentForm, type: e.target.value as any})}
            >
              <option value="cleaning">Limpeza</option>
              <option value="extraction">Extração</option>
              <option value="filling">Obturação</option>
              <option value="root-canal">Canal</option>
              <option value="orthodontics">Ortodontia</option>
              <option value="other">Outro</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Descrição do Procedimento</label>
            <textarea 
              className="flex min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Descreva o que foi realizado detalhadamente..."
              required
              value={treatmentForm.description}
              onChange={e => setTreatmentForm({...treatmentForm, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input 
              label="Data do Procedimento" 
              type="date" 
              required 
              value={treatmentForm.date} 
              onChange={e => setTreatmentForm({...treatmentForm, date: e.target.value})} 
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-zinc-100">
             <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsTreatmentModalOpen(false)}>Cancelar</Button>
             <Button type="submit" className="w-full sm:w-auto">Finalizar Atendimento</Button>
          </div>
        </form>
      </Modal>
      {/* Appointment Detail / Patient Quick Info Modal */}
      <Modal isOpen={!!appointmentDetail} onClose={() => setAppointmentDetail(null)} title="Detalhes do Agendamento">
        {appointmentDetail && (
          <div className="space-y-5">
            {/* Patient header */}
            <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                {appointmentDetail.patient?.name.charAt(0) || '?'}
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-zinc-900 text-lg leading-tight truncate">{appointmentDetail.patient?.name || 'Paciente'}</h3>
                <p className="text-xs text-zinc-500">{appointmentDetail.patient?.cpf || '—'}</p>
              </div>
            </div>

            {/* Patient info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <p className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">Nascimento</p>
                <p className="font-medium text-zinc-900">{formatDateDDMMYYYY(appointmentDetail.patient?.birthDate || '')}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <p className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">Telefone</p>
                <p className="font-medium text-zinc-900">{appointmentDetail.patient?.phone || '—'}</p>
              </div>
              <div className="col-span-2 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <p className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">E-mail</p>
                <p className="font-medium text-zinc-900 truncate">{appointmentDetail.patient?.email || '—'}</p>
              </div>
              {appointmentDetail.patient?.anamnesis && (
                <div className="col-span-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-[10px] text-amber-700 uppercase font-semibold mb-1">Anamnese</p>
                  <p className="text-sm text-zinc-700 leading-relaxed">{appointmentDetail.patient.anamnesis}</p>
                </div>
              )}
            </div>

            {/* Appointment info */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Agendamento</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-zinc-700">
                  <Calendar className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">{formatDateDDMMYYYY(appointmentDetail.apt.date)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-700">
                  <Clock className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">{appointmentDetail.apt.time}</span>
                </div>
              </div>
              {appointmentDetail.apt.notes && (
                <p className="text-xs text-zinc-600 mt-2 italic">{appointmentDetail.apt.notes}</p>
              )}
              <div className="mt-2">
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border',
                  statusClass[appointmentDetail.apt.status]
                )}>
                  {statusLabel[appointmentDetail.apt.status]}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
              {appointmentDetail.apt.status !== 'completed' && appointmentDetail.apt.status !== 'cancelled' && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    setCurrentAppointment(appointmentDetail.apt);
                    setSelectedPatient(appointmentDetail.patient);
                    setAppointmentDetail(null);
                    setIsTreatmentModalOpen(true);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" /> Concluir Atendimento
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setSelectedPatient(appointmentDetail.patient);
                  setAppointmentDetail(null);
                  onTabChange?.('dentist-patients');
                }}
              >
                <UserRound className="h-4 w-4" /> Ver Prontuário Completo
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={!!editingTreatment} 
        onClose={() => setEditingTreatment(null)} 
        title="Editar Data do Tratamento"
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          if (editingTreatment) {
            onUpdateTreatment({ ...editingTreatment, date: (e.target as any).date.value });
            setEditingTreatment(null);
          }
        }} className="space-y-4">
          <Input 
            label="Nova Data" 
            type="date" 
            name="date" 
            required 
            defaultValue={editingTreatment?.date}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingTreatment(null)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
