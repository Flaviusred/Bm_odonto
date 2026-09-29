import { useEffect, useState } from 'react';
import React from 'react';
import { Plus, Search, UserRound, Phone, Mail, Award, Trash2, Edit2, Calendar, ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { Dentist } from '../types';
import { cn, maskPhone, maskCRO, maskCPF, validateCPF } from '../lib/utils';

interface DentistListProps {
  dentists: Dentist[];
  onAddDentist: (dentist: Omit<Dentist, 'id' | 'createdAt' | 'isActive'>) => void;
  onDeleteDentist: (id: string) => void;
  onUpdateDentist: (dentist: Dentist) => void;
  onTabChange: (tab: string) => void;
  onSelectDentist: (id: string) => void;
}

export function DentistList({ dentists, onAddDentist, onDeleteDentist, onUpdateDentist, onTabChange, onSelectDentist }: DentistListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDentist, setEditingDentist] = useState<Dentist | null>(null);
  const [selectedDentistId, setSelectedDentistId] = useState<string | null>(null);
  const selectedDentistDetails = selectedDentistId ? dentists.find(d => d.id === selectedDentistId) || null : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: 'disable' | 'password', dentist: Dentist } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{ password: string, email: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    cro: '',
    cpf: '',
    password: '',
  });

  const filteredDentists = dentists.filter(d => 
    (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.specialty || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.trim().length < 3) newErrors.name = 'Nome deve ter pelo menos 3 caracteres';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido';
    
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length > 0 && (cleanPhone.length < 10 || cleanPhone.length > 11)) newErrors.phone = 'Telefone inválido (10 ou 11 dígitos)';
    }
    
    if (formData.specialty.trim().length < 3) newErrors.specialty = 'Especialidade inválida';
    if (formData.cro.trim().length < 5) newErrors.cro = 'CRO inválido';
    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    else if (!validateCPF(formData.cpf)) newErrors.cpf = 'CPF inválido';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const cpfDigits = formData.cpf.replace(/\D/g, '');
    if (editingDentist) {
      onUpdateDentist({ ...editingDentist, ...formData, cpf: cpfDigits });
    } else {
      onAddDentist({ ...formData, cpf: cpfDigits });
    }
    setIsModalOpen(false);
    setEditingDentist(null);
    setFormData({ name: '', email: '', phone: '', specialty: '', cro: '', cpf: '', password: '' });
    setErrors({});
  };

  const handleEdit = (dentist: Dentist) => {
    setEditingDentist(dentist);
    setFormData({
      name: dentist.name,
      email: dentist.email,
      phone: dentist.phone,
      specialty: dentist.specialty,
      cro: dentist.cro,
      cpf: maskCPF(dentist.cpf || ''),
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleDisable = (dentist: Dentist) => {
    setConfirmAction({ type: 'disable', dentist });
  };

  const handleGeneratePassword = (dentist: Dentist) => {
    setConfirmAction({ type: 'password', dentist });
  };

  const executeAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'disable') {
      onUpdateDentist({ ...confirmAction.dentist, isActive: !confirmAction.dentist.isActive });
    } else {
      const newPassword = Math.random().toString(36).substr(2, 8);
      setGeneratedPassword({ password: newPassword, email: confirmAction.dentist.email });
      
      // Update the dentist's password in the main users list
      // We need to pass this up to App.tsx
      onUpdateDentist({ ...confirmAction.dentist, password: newPassword });
      
      console.log(`Sending email to ${confirmAction.dentist.email}: New password is ${newPassword}`);
    }
    setConfirmAction(null);
  };

  const handleViewAgenda = (dentist: Dentist) => {
    onSelectDentist(dentist.id);
    onTabChange('appointments');
  };

  const handleBackFromDentists = () => {
    onTabChange('dashboard');
  };

  const handleOpenDentistDetails = (dentistId: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ view: 'dentist-details' }, '');
    }
    setSelectedDentistId(dentistId);
  };

  const handleBackToList = () => {
    if (typeof window !== 'undefined' && selectedDentistId) {
      const state = window.history.state as { view?: string } | null;
      if (state?.view === 'dentist-details') {
        window.history.back();
        return;
      }
    }
    setSelectedDentistId(null);
  };

  useEffect(() => {
    const onPopState = () => {
      if (selectedDentistId) {
        setSelectedDentistId(null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedDentistId]);

  const renderModals = () => (
    <>
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingDentist(null);
          setFormData({ name: '', email: '', phone: '', specialty: '', cro: '', cpf: '', password: '' });
          setErrors({});
        }} 
        title={editingDentist ? "Editar Dentista" : "Novo Dentista"}
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="CPF" 
              type="text" 
              required 
              value={formData.cpf}
              error={errors.cpf}
              autoComplete="off"
              onChange={(e) => setFormData({ ...formData, cpf: maskCPF(e.target.value) })}
              placeholder="000.000.000-00"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Especialidade</label>
              <select 
                className={cn(
                  "flex h-11 sm:h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  errors.specialty && "border-red-500 focus-visible:ring-red-500"
                )}
                required
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              >
                <option value="">Selecione uma especialidade</option>
                <option value="Clínica Geral">Clínica Geral</option>
                <option value="Ortodontia">Ortodontia</option>
                <option value="Implantodontia">Implantodontia</option>
                <option value="Odontopediatria">Odontopediatria</option>
                <option value="Periodontia">Periodontia</option>
                <option value="Endodontia">Endodontia</option>
                <option value="Prótese Dentária">Prótese Dentária</option>
                <option value="Cirurgia Bucomaxilofacial">Cirurgia Bucomaxilofacial</option>
                <option value="Harmonização Orofacial">Harmonização Orofacial</option>
                <option value="Odontologia Estética">Odontologia Estética</option>
                <option value="Outra">Outra</option>
              </select>
              {errors.specialty && <p className="text-xs text-red-500">{errors.specialty}</p>}
            </div>
            <Input 
              label="CRO" 
              required 
              value={formData.cro}
              error={errors.cro}
              onChange={(e) => setFormData({ ...formData, cro: maskCRO(e.target.value) })}
              placeholder="Ex: 12345-SP"
            />
          </div>
          {!editingDentist && (
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
              {editingDentist ? 'Salvar Alterações' : 'Cadastrar Dentista'}
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
          <p>Tem certeza que deseja {confirmAction?.type === 'disable' ? (confirmAction.dentist.isActive ? 'desabilitar' : 'habilitar') : 'gerar uma nova senha para'} {confirmAction?.dentist.name}?</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button onClick={executeAction}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={!!generatedPassword} 
        onClose={() => setGeneratedPassword(null)} 
        title="Nova Senha Gerada"
      >
        <div className="space-y-4">
          <p>A nova senha foi gerada e enviada para o e-mail: <strong>{generatedPassword?.email}</strong></p>
          <div className="flex items-center gap-2 p-3 bg-zinc-100 rounded-lg">
            <code className="flex-1 font-mono text-lg">{generatedPassword?.password}</code>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(generatedPassword?.password || '')}>Copiar</Button>
          </div>
          <Button className="w-full" onClick={() => setGeneratedPassword(null)}>Fechar</Button>
        </div>
      </Modal>
    </>
  );

  if (selectedDentistDetails) {
    return (
      <>
        <div className="p-4 lg:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleBackToList} className="gap-2">
              Voltar para lista
            </Button>
            <h1 className="text-2xl font-bold text-zinc-900">Dentista: {selectedDentistDetails.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => handleEdit(selectedDentistDetails)}>
              <Edit2 className="h-4 w-4" /> Editar
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-amber-600 border-amber-100" onClick={() => handleDisable(selectedDentistDetails)}>
              <UserRound className={cn("h-4 w-4", selectedDentistDetails.isActive ? "text-amber-600" : "text-emerald-600")} /> {selectedDentistDetails.isActive ? "Desabilitar" : "Habilitar"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-emerald-600 border-emerald-100" onClick={() => handleGeneratePassword(selectedDentistDetails)}>
              <Award className="h-4 w-4" /> Nova Senha
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserRound className="h-5 w-5 text-emerald-600" />
                Dados Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Nome Completo</label>
                  <p className="font-medium text-zinc-900 mt-1">{selectedDentistDetails.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">CRO</label>
                  <p className="font-medium text-zinc-900 mt-1">{selectedDentistDetails.cro}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Especialidade</label>
                  <p className="font-medium text-zinc-900 mt-1">{selectedDentistDetails.specialty}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</label>
                  <p className="font-medium mt-1">
                    <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", selectedDentistDetails.isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                      {selectedDentistDetails.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-emerald-600" />
                Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Telefone</label>
                  <p className="font-medium text-zinc-900 mt-1">{selectedDentistDetails.phone}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</label>
                  <p className="font-medium text-zinc-900 mt-1 break-all">{selectedDentistDetails.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={() => handleViewAgenda(selectedDentistDetails)} className="gap-2">
            <Calendar className="h-4 w-4" />
            Ver Agenda
          </Button>
        </div>
      </div>
      {renderModals()}
    </>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Button className="gap-2 sm:hidden w-fit h-10 px-4" onClick={handleBackFromDentists}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dentistas</h1>
          <p className="text-zinc-500">Gerencie a equipe de profissionais</p>
          </div>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 w-full sm:w-auto h-10">
          <Plus className="h-4 w-4" />
          Novo Dentista
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Buscar por nome ou especialidade..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-zinc-100">
            {filteredDentists.map((dentist) => (
              <div 
                key={dentist.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-50/50 transition-colors border-b border-zinc-100 last:border-0 gap-4 cursor-pointer"
                onClick={() => handleOpenDentistDetails(dentist.id)}
              >
                <div className="flex items-center gap-3 group/name text-left flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold transition-colors group-hover/name:bg-emerald-100 shrink-0">
                    {(dentist.name || '?').charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-zinc-900 group-hover/name:text-emerald-600 transition-colors truncate">
                      {dentist.name || '—'}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">CRO: {dentist.cro}</span>
                      <span className="text-[10px] text-emerald-600 uppercase font-bold">• {dentist.specialty}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => handleViewAgenda(dentist)} className="gap-2 text-zinc-600 border-zinc-200 hover:bg-zinc-50">
                    <Calendar className="h-4 w-4" /> Agenda
                  </Button>
                </div>
              </div>
            ))}

            {filteredDentists.length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                Nenhum dentista encontrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {renderModals()}
    </div>
  );
}
