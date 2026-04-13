import { useState } from 'react';
import React from 'react';
import { Plus, Search, Stethoscope, Trash2, Calendar, User, UserRound, DollarSign } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { cn } from '../lib/utils';
import { parseDate } from '../lib/dateUtils';
import { Treatment, Patient, Dentist, Appointment } from '../types';

interface TreatmentListProps {
  treatments: Treatment[];
  patients: Patient[];
  dentists: Dentist[];
  appointments: Appointment[];
  onAddTreatment: (treatment: Omit<Treatment, 'id' | 'createdAt'>) => void;
  onDeleteTreatment: (id: string) => void;
}

export function TreatmentList({ 
  treatments, 
  patients, 
  dentists, 
  appointments,
  onAddTreatment, 
  onDeleteTreatment 
}: TreatmentListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    patientId: '',
    dentistId: '',
    appointmentId: '',
    description: '',
    type: 'Consultation',
    date: new Date().toISOString().split('T')[0],
  });

  const getPatient = (id: string) => patients.find(p => p.id === id);
  const getPatientName = (id: string) => getPatient(id)?.name || 'Paciente não encontrado';
  const getDentistName = (id: string) => dentists.find(d => d.id === id)?.name || 'Dentista não encontrado';

  const translateType = (type: string) => {
    const types: Record<string, string> = {
      'Consultation': 'Consulta',
      'Surgery': 'Cirurgia',
      'Cleaning': 'Limpeza',
      'Extraction': 'Extração',
      'Filling': 'Restauração',
      'Root Canal': 'Canal',
      'Orthodontics': 'Ortodontia',
      'X-Ray': 'Raio-X',
      'Exam': 'Exame',
      'Other': 'Outro'
    };
    return types[type] || type;
  };

  const filteredTreatments = treatments.filter(t => 
    getPatientName(t.patientId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
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
    if (!formData.date) newErrors.date = 'Selecione uma data';
    if (formData.description.length < 5) newErrors.description = 'Descrição deve ter pelo menos 5 caracteres';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onAddTreatment(formData as any);
    setIsModalOpen(false);
    setFormData({ 
      patientId: '', 
      dentistId: '', 
      appointmentId: '', 
      description: '', 
      type: 'Consultation',
      date: new Date().toISOString().split('T')[0] 
    });
    setErrors({});
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Tratamentos</h1>
          <p className="text-zinc-500">Histórico e registro de procedimentos realizados</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Registrar Tratamento
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Buscar por paciente ou descrição..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                  <th className="px-6 py-4 font-semibold">Data</th>
                  <th className="px-6 py-4 font-semibold">Paciente</th>
                  <th className="px-6 py-4 font-semibold">Dentista</th>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Descrição</th>
                  <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTreatments.map((treatment) => (
                  <tr key={treatment.id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {parseDate(treatment.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                          {getPatientName(treatment.patientId).charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-900">{getPatientName(treatment.patientId)}</span>
                          <button 
                            onClick={() => handleShowAnamnesis(treatment.patientId)}
                            className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <Stethoscope className="h-2.5 w-2.5" />
                            Ver Anamnese
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {getDentistName(treatment.dentistId)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase">
                        {translateType(treatment.type || 'Consultation')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {treatment.description}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" onClick={() => onDeleteTreatment(treatment.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredTreatments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      Nenhum tratamento registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-zinc-100">
            {filteredTreatments.map((treatment) => (
              <div key={treatment.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{getPatientName(treatment.patientId)}</p>
                    <p className="text-xs text-zinc-500">{parseDate(treatment.date).toLocaleDateString('pt-BR')} • {getDentistName(treatment.dentistId)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteTreatment(treatment.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase">
                    {translateType(treatment.type || 'Consultation')}
                  </span>
                  <button 
                    onClick={() => handleShowAnamnesis(treatment.patientId)}
                    className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1"
                  >
                    <Stethoscope className="h-2.5 w-2.5" />
                    Ver Anamnese
                  </button>
                </div>
                <p className="text-sm text-zinc-600 bg-zinc-50 p-2 rounded-lg">{treatment.description}</p>
              </div>
            ))}
            {filteredTreatments.length === 0 && (
              <div className="p-12 text-center text-zinc-500">
                Nenhum tratamento registrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setErrors({});
          setFormData({ 
            patientId: '', 
            dentistId: '', 
            appointmentId: '', 
            description: '', 
            type: 'Consultation',
            date: new Date().toISOString().split('T')[0] 
          });
        }} 
        title="Novo Registro de Tratamento"
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
                <option key={d.id} value={d.id}>{d.name}</option>
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Tipo de Atendimento</label>
              <select 
                className="flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="Consultation">Consulta</option>
                <option value="Surgery">Cirurgia</option>
                <option value="Cleaning">Limpeza</option>
                <option value="Extraction">Extração</option>
                <option value="Filling">Restauração</option>
                <option value="Root Canal">Canal</option>
                <option value="Orthodontics">Ortodontia</option>
                <option value="X-Ray">Raio-X</option>
                <option value="Exam">Exame</option>
                <option value="Other">Outro</option>
              </select>
            </div>
          </div>
          <Input 
            label="Descrição do Procedimento" 
            required 
            value={formData.description}
            error={errors.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Salvar Registro
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
