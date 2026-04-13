import React, { useState } from 'react';
import { User, Patient, Appointment, Dentist, Treatment } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Calendar, Stethoscope, UserRound, Phone, Mail, MapPin, CreditCard, Clock, CheckCircle2, XCircle, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { parseDate } from '../lib/dateUtils';

interface PatientPortalProps {
  activeTab: string;
  patient: Patient;
  allPatients: Patient[];
  appointments: Appointment[];
  dentists: Dentist[];
  treatments: Treatment[];
  onUpdateProfile: (updated: Patient) => void;
}

export function PatientPortal({ 
  activeTab, 
  patient, 
  allPatients,
  appointments, 
  dentists, 
  treatments,
  onUpdateProfile 
}: PatientPortalProps) {
  const dependents = allPatients.filter(p => p.dependentOf === patient.id);
  const patientAndDependentsIds = [patient.id, ...dependents.map(d => d.id)];
  
  const filteredAppointments = appointments.filter(a => patientAndDependentsIds.includes(a.patientId));
  const filteredTreatments = treatments.filter(t => patientAndDependentsIds.includes(t.patientId));
  
  const [formData, setFormData] = useState({
    name: patient.name,
    email: patient.email,
    phone: patient.phone,
    address: patient.address,
  });

  const getDentistName = (id: string) => dentists.find(d => d.id === id)?.name || 'Dentista';

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({ ...patient, ...formData });
    alert('Perfil atualizado com sucesso!');
  };

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
      'Other': 'Outro',
      'Identity': 'Identidade',
      'Medical Report': 'Laudo Médico',
      'Prescription': 'Receita',
      'Consent Form': 'Termo de Consentimento'
    };
    return types[type] || type;
  };

  if (activeTab === 'patient-profile') {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Meu Perfil</h1>
            <p className="text-zinc-500">Mantenha seus dados de contato atualizados</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-1 border-none shadow-sm">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-emerald-500 flex items-center justify-center text-white text-3xl font-bold mb-4">
                {patient.name.charAt(0)}
              </div>
              <h2 className="text-xl font-bold text-zinc-900">{patient.name}</h2>
              <p className="text-sm text-zinc-500 mb-6">Paciente desde {new Date(patient.createdAt).toLocaleDateString('pt-BR')}</p>
              
              <div className="w-full space-y-4 text-left">
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <CreditCard className="h-4 w-4 text-zinc-400" />
                  <span>CPF: {patient.cpf}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span>Nascimento: {new Date(patient.birthDate).toLocaleDateString('pt-BR')}</span>
                </div>
                {patient.anamnesis && (
                  <div className="pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-3 text-sm font-semibold text-emerald-600 mb-2">
                      <Stethoscope className="h-4 w-4" />
                      <span>Minha Anamnese</span>
                    </div>
                    <p className="text-xs text-zinc-500 italic leading-relaxed bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                      {patient.anamnesis}
                    </p>
                  </div>
                )}
                {dependents.length > 0 && (
                  <div className="pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-3 text-sm font-semibold text-emerald-600 mb-2">
                      <Users className="h-4 w-4" />
                      <span>Dependentes</span>
                    </div>
                    <ul className="space-y-1">
                      {dependents.map(d => (
                        <li key={d.id} className="text-xs text-zinc-600">{d.name} ({d.parentesco})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-none shadow-sm">
            <CardHeader>
              <CardTitle>Editar Informações</CardTitle>
              <CardDescription>Você pode alterar seus dados de contato e endereço.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="space-y-4">
                <Input 
                  label="Nome Completo" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    label="Email" 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                  <Input 
                    label="Telefone" 
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <Input 
                  label="Endereço" 
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit">Salvar Alterações</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (activeTab === 'patient-appointments') {
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
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Meus Agendamentos</h1>
          <p className="text-zinc-500">Confira suas próximas consultas e histórico</p>
        </div>

        <Card className="border-none shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                    <th className="px-4 lg:px-6 py-4 font-semibold">Data e Hora</th>
                    <th className="px-4 lg:px-6 py-4 font-semibold">Dentista</th>
                    <th className="px-4 lg:px-6 py-4 font-semibold">Status</th>
                    <th className="px-4 lg:px-6 py-4 font-semibold">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredAppointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 lg:px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                            <Calendar className="h-3 w-3 text-emerald-500" />
                            {parseDate(apt.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {apt.time}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                          <UserRound className="h-3 w-3 text-zinc-400" />
                          {getDentistName(apt.dentistId)}
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
                      <td className="px-4 lg:px-6 py-4 text-sm text-zinc-500 italic">
                        {apt.notes || '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredAppointments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                        Você ainda não possui agendamentos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-zinc-100">
              {filteredAppointments.map((apt) => (
                <div key={apt.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                        <Calendar className="h-4 w-4 text-emerald-500" />
                        {parseDate(apt.date).toLocaleDateString('pt-BR')} - {apt.time}
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
                  {apt.notes && (
                    <p className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded-lg border border-zinc-100 italic">
                      {apt.notes}
                    </p>
                  )}
                </div>
              ))}
              {filteredAppointments.length === 0 && (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  Você ainda não possui agendamentos.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeTab === 'patient-treatments') {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Meu Prontuário</h1>
          <p className="text-zinc-500">Histórico de procedimentos e tratamentos realizados</p>
        </div>

        <div className="space-y-4">
          {filteredTreatments.map((treatment) => (
            <Card key={treatment.id} className="border-none shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <Stethoscope className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900">{treatment.description}</h3>
                      <p className="text-sm text-zinc-500">Realizado por {getDentistName(treatment.dentistId)}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <Calendar className="h-3 w-3" />
                          {parseDate(treatment.date).toLocaleDateString('pt-BR')}
                        </div>
                        {treatment.type && (
                          <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase">
                            {translateType(treatment.type)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredTreatments.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-zinc-200">
              <Stethoscope className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
              <p className="text-zinc-500">Nenhum tratamento registrado em seu prontuário.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
