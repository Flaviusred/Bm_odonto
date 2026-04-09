import { useState, Component } from 'react';
import React from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, Phone, Mail, Calendar, History, ChevronDown, ChevronUp, Stethoscope, UserRound, Award, Users, CornerDownRight, ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { Patient, Appointment, Treatment, Dentist, PatientType } from '../types';
import { patientService } from '../services/patientService';
import { cn, validateCPF, maskCPF, maskPhone, maskCEP } from '../lib/utils';
import { formatDateDDMMYYYY, formatDateLocal, parseDate, parseDateTime } from '../lib/dateUtils';

interface PatientListProps {
  patients: Patient[];
  appointments: Appointment[];
  treatments: Treatment[];
  dentists: Dentist[];
  onAddPatient: (patient: Omit<Patient, 'id' | 'createdAt' | 'isActive'> & { id?: string }) => void;
  onDeletePatient: (id: string) => void;
  onUpdatePatient: (patient: Patient) => void;
  onTabChange?: (tab: string) => void;
}

export function PatientList({ 
  patients, 
  appointments, 
  treatments, 
  dentists, 
  onAddPatient, 
  onDeletePatient, 
  onUpdatePatient,
  onTabChange
}: PatientListProps) {
  return (
    <PatientListContent 
      patients={patients} 
      appointments={appointments} 
      treatments={treatments} 
      dentists={dentists} 
      onAddPatient={onAddPatient} 
      onDeletePatient={onDeletePatient} 
      onUpdatePatient={onUpdatePatient}
      onTabChange={onTabChange}
    />
  );
}

function PatientListContent({ 
  patients, 
  appointments, 
  treatments, 
  dentists, 
  onAddPatient, 
  onDeletePatient, 
  onUpdatePatient,
  onTabChange
}: PatientListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const selectedPatientDetails = selectedPatientId ? patients.find(p => p.id === selectedPatientId) || null : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedTreatments, setExpandedTreatments] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [dentistFilter, setDentistFilter] = useState('all');
  const [confirmAction, setConfirmAction] = useState<{ type: 'disable' | 'password', patient: Patient } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{ password: string, email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cbmpbIdentifier, setCbmpbIdentifier] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isConfirmImportOpen, setIsConfirmImportOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [viewingDependentsOf, setViewingDependentsOf] = useState<Patient | null>(null);

  const handleBackFromPatients = () => {
    onTabChange?.('dashboard');
  };

  const handleSearchCBMPB = async () => {
    if (!cbmpbIdentifier) return;
    setIsSearching(true);
    try {
      const { titular, dependentes } = await patientService.fetchCBMPBPatientData(cbmpbIdentifier);
      
      // Verificar se o titular já existe
      const existingTitular = patients.find(p => p.cpf === titular.cpf);
      const titularId = existingTitular ? existingTitular.id : (titular.id || Math.random().toString(36).substr(2, 9));
      
      // Adicionar titular se não existir (aguarda a operação quando possível)
      try {
        if (!existingTitular) {
          await Promise.resolve(onAddPatient({ 
            ...titular, 
            id: titularId,
            patientType: 'cbmpb'
          } as any));
        }

        // Adicionar dependentes vinculados ao titularId (aguarda todas as gravações)
        const depPromises: Promise<any>[] = [];
        for (const dep of dependentes) {
          const existingDep = patients.find(p => 
            p.dependentOf === titularId && 
            (p.name === dep.name || (dep.cpf && p.cpf === dep.cpf))
          );
          if (!existingDep) {
            depPromises.push(Promise.resolve(onAddPatient({ 
              ...dep, 
              patientType: 'cbmpb',
              dependentOf: titularId 
            } as any)));
          }
        }
        if (depPromises.length > 0) await Promise.all(depPromises);
      } catch (err) {
        alert('Erro ao salvar pacientes importados: ' + (err instanceof Error ? err.message : String(err)));
        setIsSearching(false);
        setIsConfirmImportOpen(false);
        return;
      }
      
      // Abrir modal de dependentes se houver dependentes
      if (dependentes.length > 0) {
        const titularPatient = existingTitular || { ...titular, id: titularId, patientType: 'cbmpb' } as Patient;
        setViewingDependentsOf(titularPatient);
      }
      
      // Verificar campos incompletos
      const incompleteFields = [];
      if (!titular.email) incompleteFields.push('Email');
      if (!titular.phone) incompleteFields.push('Telefone');
      if (!titular.address) incompleteFields.push('Endereço');
      
      if (incompleteFields.length > 0) {
        alert(`Dados importados com sucesso, mas os seguintes campos estão incompletos: ${incompleteFields.join(', ')}. Por favor, complete o cadastro.`);
      } else {
        setSuccessMessage('Dados importados com sucesso!');
        setIsSuccessModalOpen(true);
      }
      setIsModalOpen(false);
      setCbmpbIdentifier('');
    } catch (error) {
      alert('Erro ao buscar dados do militar.');
    } finally {
      setIsSearching(false);
      setIsConfirmImportOpen(false);
    }
  };

    const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    birthDate: '',
    address: '',
    anamnesis: '',
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    patientType: 'civil' as PatientType,
    securityType: undefined as any,
    registrationNumber: '',
    functionalCategory: '',
    dependentOf: '',
    parentesco: '',
    password: '',
  });

  const filteredPatients = [...patients]
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })
    .filter(p => 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cpf && p.cpf.includes(searchTerm))
    );

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.trim().length < 3) newErrors.name = 'Nome deve ter pelo menos 3 caracteres';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido';
    
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length > 0 && (cleanPhone.length < 10 || cleanPhone.length > 11)) newErrors.phone = 'Telefone inválido (10 ou 11 dígitos)';
    }
    
    if (!validateCPF(formData.cpf)) newErrors.cpf = 'CPF inválido';
    
    if (!formData.birthDate) newErrors.birthDate = 'Data de nascimento é obrigatória';
    else if (formData.birthDate > new Date().toISOString().split('T')[0]) newErrors.birthDate = 'Data não pode ser no futuro';
    
    if (formData.patientType === 'security' && !formData.securityType) {
      newErrors.securityType = 'Selecione a força de segurança';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const cleanCpf = formData.cpf.replace(/\D/g, '');
    const isDuplicate = patients.some(p => p.cpf.replace(/\D/g, '') === cleanCpf && p.id !== editingPatient?.id);
    
    if (isDuplicate) {
      alert('Este CPF já possui cadastro.');
      return;
    }

    if (editingPatient) {
      onUpdatePatient({ ...editingPatient, ...formData });
      setSuccessMessage('Paciente atualizado com sucesso!');
      setIsSuccessModalOpen(true);
    } else {
      // Herdar email e telefone do titular se o dependente não tiver os campos preenchidos
      let finalData = { ...formData };
      if (finalData.dependentOf) {
        const titular = patients.find(p => p.id === finalData.dependentOf);
        if (titular) {
          if (!finalData.email && titular.email) finalData.email = titular.email;
          if (!finalData.phone && titular.phone) finalData.phone = titular.phone;
        }
      }
      onAddPatient(finalData);
      setSuccessMessage('Paciente cadastrado com sucesso!');
      setIsSuccessModalOpen(true);
    }
    setIsModalOpen(false);
    setEditingPatient(null);
    setFormData({ 
      name: '', 
      email: '', 
      phone: '', 
      cpf: '', 
      birthDate: '', 
      address: '', 
      anamnesis: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      patientType: 'civil',
      securityType: undefined,
      registrationNumber: '',
      functionalCategory: '',
      dependentOf: '',
      parentesco: '',
      password: ''
    });
    setErrors({});
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setFormData({
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
      cpf: patient.cpf,
      birthDate: patient.birthDate ? formatDateLocal(parseDate(patient.birthDate)) : '',
      address: patient.address,
      anamnesis: patient.anamnesis || '',
      cep: patient.cep || '',
      street: patient.street || '',
      number: patient.number || '',
      neighborhood: patient.neighborhood || '',
      city: patient.city || '',
      state: patient.state || '',
      patientType: patient.patientType,
      securityType: patient.securityType,
      registrationNumber: patient.registrationNumber || '',
      functionalCategory: patient.functionalCategory || '',
      dependentOf: patient.dependentOf || '',
      parentesco: patient.parentesco || '',
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleDisable = (patient: Patient) => {
    setConfirmAction({ type: 'disable', patient });
  };

  const handleGeneratePassword = (patient: Patient) => {
    setConfirmAction({ type: 'password', patient });
  };

  const handleCopyPassword = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword.password);
      setCopied(true);
      setTimeout(() => {
        setGeneratedPassword(null);
        setCopied(false);
      }, 1000);
    }
  };

  const executeAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'disable') {
      onUpdatePatient({ ...confirmAction.patient, isActive: !confirmAction.patient.isActive });
    } else {
      const newPassword = Math.random().toString(36).substr(2, 8);
      setGeneratedPassword({ password: newPassword, email: confirmAction.patient.email });
      onUpdatePatient({ ...confirmAction.patient, password: newPassword });
      console.log(`Sending email to ${confirmAction.patient.email}: New password is ${newPassword}`);
    }
    setConfirmAction(null);
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

  const getDentistName = (id: string) => dentists.find(d => d.id === id)?.name || 'Dentista';

  const toggleTreatment = (id: string) => {
    setExpandedTreatments(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const getDependents = (titularId: string) => {
    return patients.filter(p => p.dependentOf === titularId);
  };

  const isTitular = (patientId: string) => {
    return patients.some(p => p.dependentOf === patientId);
  };

  const renderPatientItem = (patient: Patient) => {
    const dependents = getDependents(patient.id);
    const hasDependents = dependents.length > 0;

    return (
      <div 
        key={patient.id}
        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-50/50 transition-colors border-b border-zinc-100 last:border-0 gap-4 cursor-pointer"
        onClick={() => setSelectedPatientId(patient.id)}
      >
        <div className="flex items-center gap-3 group/name text-left flex-1 min-w-0">
          <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold transition-colors group-hover/name:bg-emerald-100 shrink-0">
            {(patient.name || '?').charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-zinc-900 group-hover/name:text-emerald-600 transition-colors truncate">
              {patient.name || '—'}
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {patient.registrationNumber ? (
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Matrícula: {patient.registrationNumber}</span>
              ) : (
                <span className="text-[10px] text-zinc-500 uppercase font-bold">CPF: {patient.cpf}</span>
              )}
              {patient.parentesco && (
                <span className="text-[10px] text-zinc-400 uppercase font-bold">• {patient.parentesco}</span>
              )}
              {patient.patientType === 'cbmpb' && !patient.parentesco && (
                <span className="text-[10px] text-emerald-600 uppercase font-bold">• Titular CBMPB</span>
              )}
              {patient.securityType && (
                <span className="text-[10px] text-blue-600 uppercase font-bold">• {patient.securityType.toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:shrink-0" onClick={(e) => e.stopPropagation()}>
          {hasDependents && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setViewingDependentsOf(patient)} 
              className="gap-2 text-zinc-600 border-zinc-200 hover:bg-zinc-50"
            >
              <Users className="h-4 w-4" /> {dependents.length} dep.
            </Button>
          )}
        </div>
      </div>
    );
  };

  const mainPatients = filteredPatients.filter(p => !p.dependentOf);
  const cbmpbTitulars = mainPatients.filter(p => p.patientType === 'cbmpb');
  const otherPatients = mainPatients.filter(p => p.patientType !== 'cbmpb');

  const renderModals = () => (
    <>
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingPatient(null);
          setFormData({ name: '', email: '', phone: '', cpf: '', birthDate: '', address: '', anamnesis: '' });
          setErrors({});
        }} 
        title={editingPatient ? "Editar Paciente" : "Novo Paciente"}
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <Input 
              label="Buscar Militar (Matrícula/CPF)" 
              value={cbmpbIdentifier}
              onChange={(e) => setCbmpbIdentifier(e.target.value)}
            />
            <Button type="button" onClick={() => setIsConfirmImportOpen(true)} className="mt-6" disabled={isSearching}>
              {isSearching ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-zinc-500">ou preencha manualmente</span>
            </div>
          </div>
          <Input 
            label="Nome Completo" 
            required 
            value={formData.name}
            error={errors.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="Email" 
              type="email" 
              required 
              value={formData.email}
              error={errors.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input 
              label="Telefone" 
              required 
              value={formData.phone}
              error={errors.phone}
              onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
            />
          </div>
          <Input 
            label="CPF" 
            required 
            value={formData.cpf}
            error={errors.cpf}
            onChange={(e) => setFormData({ ...formData, cpf: maskCPF(e.target.value) })}
          />
          <Input 
            label="Data de Nascimento" 
            type="date" 
            required 
            value={formData.birthDate}
            error={errors.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Tipo de Paciente</label>
              <select 
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                value={formData.patientType}
                onChange={(e) => setFormData({ ...formData, patientType: e.target.value as PatientType })}
              >
                <option value="civil">Civil</option>
                <option value="cbmpb">CBMPB</option>
                <option value="security">Segurança Pública</option>
              </select>
            </div>
            {formData.patientType === 'security' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Força de Segurança</label>
                <select 
                  className={cn(
                    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500",
                    errors.securityType && "border-red-500 focus:ring-red-500"
                  )}
                  value={formData.securityType}
                  onChange={(e) => setFormData({ ...formData, securityType: e.target.value as any })}
                >
                  <option value="">Selecione...</option>
                  <option value="pm">Polícia Militar (PM)</option>
                  <option value="pc">Polícia Civil (PC)</option>
                  <option value="pp">Polícia Penal (PP)</option>
                </select>
                {errors.securityType && <p className="text-xs text-red-500">{errors.securityType}</p>}
              </div>
            )}
            {formData.patientType !== 'civil' && (
              <Input 
                label="Matrícula" 
                value={formData.registrationNumber}
                onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
              />
            )}
            {formData.patientType === 'cbmpb' && (
              <Input 
                label="Categoria Funcional" 
                value={formData.functionalCategory}
                onChange={(e) => setFormData({ ...formData, functionalCategory: e.target.value })}
              />
            )}
            {formData.patientType === 'cbmpb' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Grau de Parentesco</label>
                <select 
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  value={formData.parentesco}
                  onChange={(e) => setFormData({ ...formData, parentesco: e.target.value })}
                >
                  <option value="">Titular</option>
                  <option value="Cônjuge">Cônjuge</option>
                  <option value="Filho(a)">Filho(a)</option>
                  <option value="Pai/Mãe">Pai/Mãe</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            )}
          </div>
          <Input 
            label="Endereço" 
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <Input 
            label="Anamnese (Histórico Médico)" 
            value={formData.anamnesis}
            onChange={(e) => setFormData({ ...formData, anamnesis: e.target.value })}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Input 
              label="CEP" 
              value={formData.cep}
              onChange={(e) => setFormData({ ...formData, cep: maskCEP(e.target.value) })}
            />
            <Input 
              label="Rua" 
              value={formData.street}
              onChange={(e) => setFormData({ ...formData, street: e.target.value })}
            />
            <Input 
              label="Número" 
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            />
            <Input 
              label="Bairro" 
              value={formData.neighborhood}
              onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
            />
            <Input 
              label="Cidade" 
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
            <Input 
              label="Estado" 
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          {!editingPatient && (
            <Input 
              label="Senha" 
              type="password" 
              required 
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              {editingPatient ? 'Salvar Alterações' : 'Cadastrar Paciente'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        title={confirmAction?.type === 'disable' ? "Confirmar Ação" : "Confirmar Geração de Senha"}
      >
        <div className="space-y-4">
          <p>Tem certeza que deseja {confirmAction?.type === 'disable' ? (confirmAction.patient.isActive ? 'desabilitar' : 'habilitar') : 'gerar uma nova senha para'} {confirmAction?.patient.name}?</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button onClick={executeAction}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={!!generatedPassword} 
        onClose={() => setGeneratedPassword(null)} 
        title="Senha Gerada com Sucesso"
      >
        <div className="space-y-4">
          <div 
            className="p-4 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-100 text-center cursor-pointer hover:bg-emerald-100 transition"
            onClick={handleCopyPassword}
          >
            <p className="text-sm mb-2">{copied ? 'Senha copiada!' : 'A nova senha é (clique para copiar):'}</p>
            <p className="text-2xl font-mono font-bold tracking-wider">{generatedPassword?.password}</p>
          </div>
          <p className="text-sm text-zinc-500 text-center">
            Um email foi enviado para <strong>{generatedPassword?.email}</strong> com estas instruções.
          </p>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setGeneratedPassword(null)}>Fechar</Button>
            <Button onClick={handleCopyPassword}>Copiar Senha</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!viewingDependentsOf}
        onClose={() => setViewingDependentsOf(null)}
        title={`Dependentes de ${viewingDependentsOf?.name}`}
      >
        <div className="space-y-4">
          <div className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
            {viewingDependentsOf && patients.filter(p => p.dependentOf === viewingDependentsOf.id).map(dep => (
              <div key={dep.id} className="p-4 bg-white hover:bg-zinc-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-zinc-900">{dep.name}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-zinc-500">
                    <span>{dep.parentesco}</span>
                    <span>•</span>
                    <span>{dep.cpf}</span>
                  </div>
                  {dep.email && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-zinc-400">
                      <Mail className="h-3 w-3" />
                      <span className="truncate max-w-[180px]">{dep.email}</span>
                      {dep.email === patients.find(p => p.id === dep.dependentOf)?.email && (
                        <span className="text-[10px] text-emerald-600 font-bold ml-1">(herdado)</span>
                      )}
                    </div>
                  )}
                  {dep.phone && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-400">
                      <Phone className="h-3 w-3" />
                      <span>{dep.phone}</span>
                      {dep.phone === patients.find(p => p.id === dep.dependentOf)?.phone && (
                        <span className="text-[10px] text-emerald-600 font-bold ml-1">(herdado)</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-2 text-zinc-600 border-zinc-200" onClick={() => {
                    setViewingDependentsOf(null);
                    handleEdit(dep);
                  }}>
                    <Edit2 className="h-3 w-3" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-2 text-emerald-600 border-emerald-50" onClick={() => {
                    setViewingDependentsOf(null);
                    setSelectedPatientId(dep.id);
                  }}>
                    <History className="h-3 w-3" /> Prontuário
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-2 text-amber-600 border-amber-50" onClick={() => {
                    setViewingDependentsOf(null);
                    handleDisable(dep);
                  }}>
                    <UserRound className={cn("h-3 w-3", dep.isActive ? "text-amber-600" : "text-emerald-600")} /> {dep.isActive ? "Desabilitar" : "Habilitar"}
                  </Button>
                </div>
              </div>
            ))}
            {viewingDependentsOf && patients.filter(p => p.dependentOf === viewingDependentsOf.id).length === 0 && (
              <p className="text-center text-zinc-500 py-4">Nenhum dependente encontrado.</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );

  if (selectedPatientDetails) {
    const patientAppointments = appointments
      .filter(a => a.patientId === selectedPatientDetails.id)
      .sort((a, b) => parseDateTime(b.date, b.time).getTime() - parseDateTime(a.date, a.time).getTime());
    
    const patientTreatments = treatments
      .filter(t => t.patientId === selectedPatientDetails.id)
      .filter(t => 
        (t.description.toLowerCase().includes(historySearch.toLowerCase()) ||
         (t.type && t.type.toLowerCase().includes(historySearch.toLowerCase()))) &&
        (dentistFilter === 'all' || t.dentistId === dentistFilter)
      )
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());

    const groupedTreatments = patientTreatments.reduce((acc, t) => {
      const date = parseDate(t.date).toLocaleDateString('pt-BR');
      const key = `${date}-${t.dentistId}`;
      if (!acc[key]) {
        acc[key] = { date, dentistId: t.dentistId, treatments: [] };
      }
      acc[key].treatments.push(t);
      return acc;
    }, {} as Record<string, { date: string, dentistId: string, treatments: Treatment[] }>);
    
    const groupedTreatmentsArray = Object.values(groupedTreatments);

    return (
      <>
        <div className="p-4 lg:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedPatientId(null)}
                className="self-start sm:self-auto flex items-center gap-2 text-zinc-500 hover:text-zinc-900 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Voltar para lista</span>
                <span className="sm:hidden">Voltar</span>
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 leading-tight">
                <span className="hidden sm:inline">Prontuário: </span>
                {selectedPatientDetails.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-none justify-center" onClick={() => handleEdit(selectedPatientDetails)}>
                <Edit2 className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-amber-600 border-amber-100 flex-1 sm:flex-none justify-center" onClick={() => handleDisable(selectedPatientDetails)}>
                <UserRound className={cn("h-4 w-4", selectedPatientDetails.isActive ? "text-amber-600" : "text-emerald-600")} /> 
                <span className="whitespace-nowrap">{selectedPatientDetails.isActive ? "Desabilitar" : "Habilitar"}</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-emerald-600 border-emerald-100 flex-1 sm:flex-none justify-center" onClick={() => handleGeneratePassword(selectedPatientDetails)}>
                <Award className="h-4 w-4" /> 
                <span className="whitespace-nowrap">Nova Senha</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Patient Info */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Informações do Paciente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span>Nascimento: {formatDateDDMMYYYY(selectedPatientDetails.birthDate)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <UserRound className="h-4 w-4 text-zinc-400" />
                  <span>CPF: {selectedPatientDetails.cpf}</span>
                </div>
                {selectedPatientDetails.registrationNumber && (
                  <div className="flex items-center gap-3 text-sm text-zinc-600">
                    <Award className="h-4 w-4 text-zinc-400" />
                    <span>Matrícula: {selectedPatientDetails.registrationNumber}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <Phone className="h-4 w-4 text-zinc-400" />
                  <span>{selectedPatientDetails.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  <Mail className="h-4 w-4 text-zinc-400" />
                  <span>{selectedPatientDetails.email}</span>
                </div>
                <div className="pt-4 border-t border-zinc-100">
                  <h4 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Anamnese
                  </h4>
                  <p className="text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-100 italic">
                    {selectedPatientDetails.anamnesis || 'Nenhuma anamnese registrada.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Próximos Agendamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {patientAppointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').map(apt => (
                  <div key={apt.id} className="p-3 rounded-lg border border-zinc-100 bg-zinc-50/50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                        <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                        {formatDateDDMMYYYY(apt.date)}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {apt.time}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">Com {getDentistName(apt.dentistId)}</p>
                  </div>
                ))}
                {patientAppointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length === 0 && (
                  <p className="text-sm text-zinc-400 italic text-center py-4">Nenhum agendamento futuro.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* History */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="border-b border-zinc-100 pb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5 text-emerald-500" />
                      Histórico de Atendimentos
                    </CardTitle>
                    <CardDescription>Tratamentos e procedimentos realizados.</CardDescription>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input 
                      placeholder="Buscar no histórico..." 
                      className="pl-9 h-9 text-sm bg-zinc-50 border-zinc-200 focus:bg-white transition-colors"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>
                  <select 
                    className="h-9 text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 focus:bg-white transition-colors"
                    value={dentistFilter}
                    onChange={(e) => setDentistFilter(e.target.value)}
                  >
                    <option value="all">Todos os dentistas</option>
                    {dentists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {groupedTreatmentsArray.map((group, idx) => (
                    <div key={idx} className="p-6">
                      <div className="flex items-center gap-2 mb-4 text-sm font-bold text-zinc-900">
                        <Calendar className="h-4 w-4 text-emerald-500" />
                        {group.date} - <span className="text-zinc-500 font-normal">{getDentistName(group.dentistId)}</span>
                      </div>
                      <div className="space-y-3">
                        {group.treatments.map(t => {
                          const isExpanded = expandedTreatments.includes(t.id);
                          return (
                            <div key={t.id} className="border border-zinc-100 rounded-xl overflow-hidden">
                              <button 
                                onClick={() => toggleTreatment(t.id)}
                                className="w-full p-4 text-left flex justify-between items-center hover:bg-zinc-50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                    <Stethoscope className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-zinc-900">{translateType(t.type)}</h4>
                                    <p className="text-xs text-zinc-500">{t.description.substring(0, 50)}{t.description.length > 50 ? '...' : ''}</p>
                                  </div>
                                </div>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                              </button>
                              {isExpanded && (
                                <div className="p-4 pt-0 bg-zinc-50 text-sm text-zinc-700 border-t border-zinc-100">
                                  {t.description}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {groupedTreatmentsArray.length === 0 && (
                    <div className="p-12 text-center text-zinc-500 italic">
                      Nenhum tratamento encontrado.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {renderModals()}
    </>
  );
}

return (
  <>
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Button className="gap-2 sm:hidden w-fit h-10 px-4" onClick={handleBackFromPatients}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Pacientes</h1>
            <p className="text-zinc-500 text-sm">Gerencie o cadastro de seus pacientes</p>
          </div>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 w-full sm:w-auto h-10">
          <Plus className="h-4 w-4" />
          <span className="whitespace-nowrap">Novo Paciente</span>
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Buscar por nome ou CPF..." 
              className="pl-10 bg-white h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-zinc-100">
            {cbmpbTitulars.length > 0 && (
              <div className="bg-zinc-50/80 px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                Titulares CBMPB e Dependentes
              </div>
            )}
            {cbmpbTitulars.map(renderPatientItem)}

            {otherPatients.length > 0 && (
              <div className="bg-zinc-50/80 px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider border-y border-zinc-100">
                Outros Pacientes
              </div>
            )}
            {otherPatients.map(renderPatientItem)}

            {mainPatients.length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                Nenhum paciente encontrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
      {renderModals()}
      <Modal isOpen={isConfirmImportOpen} onClose={() => setIsConfirmImportOpen(false)} title="Confirmar Importação">
        <div className="space-y-4">
          <p>Deseja realmente importar os dados deste paciente da API?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsConfirmImportOpen(false)}>Não</Button>
            <Button onClick={() => {
              handleSearchCBMPB();
              setIsConfirmImportOpen(false);
            }}>Sim</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isSuccessModalOpen} onClose={() => setIsSuccessModalOpen(false)} title="Sucesso">
        <div className="space-y-4">
          <p>{successMessage}</p>
          <div className="flex justify-end">
            <Button onClick={() => setIsSuccessModalOpen(false)}>OK</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
