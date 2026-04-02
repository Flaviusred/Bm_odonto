import { useState } from 'react';
import React from 'react';
import { Plus, Search, UserRound, Phone, Mail, Award, Trash2, Edit2 } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Input } from './Input';
import { Modal } from './Modal';
import { Attendant } from '../types';
import { cn, maskPhone } from '../lib/utils';

interface AttendantListProps {
  attendants: Attendant[];
  onAddAttendant: (attendant: Omit<Attendant, 'id' | 'createdAt' | 'isActive'>) => void;
  onDeleteAttendant: (id: string) => void;
  onUpdateAttendant: (attendant: Attendant) => void;
}

export function AttendantList({ attendants, onAddAttendant, onDeleteAttendant, onUpdateAttendant }: AttendantListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAttendant, setEditingAttendant] = useState<Attendant | null>(null);
  const [selectedAttendantId, setSelectedAttendantId] = useState<string | null>(null);
  const selectedAttendantDetails = selectedAttendantId ? attendants.find(a => a.id === selectedAttendantId) || null : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: 'disable' | 'password', attendant: Attendant } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{ password: string, email: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });

  const filteredAttendants = attendants.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.trim().length < 3) newErrors.name = 'Nome deve ter pelo menos 3 caracteres';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido';
    
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length > 0 && (cleanPhone.length < 10 || cleanPhone.length > 11)) newErrors.phone = 'Telefone inválido (10 ou 11 dígitos)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (editingAttendant) {
      onUpdateAttendant({ ...editingAttendant, ...formData });
    } else {
      onAddAttendant(formData);
    }
    setIsModalOpen(false);
    setEditingAttendant(null);
    setFormData({ name: '', email: '', phone: '', password: '' });
    setErrors({});
  };

  const handleEdit = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setFormData({
      name: attendant.name,
      email: attendant.email,
      phone: attendant.phone,
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleDisable = (attendant: Attendant) => {
    setConfirmAction({ type: 'disable', attendant });
  };

  const handleGeneratePassword = (attendant: Attendant) => {
    setConfirmAction({ type: 'password', attendant });
  };

  const executeAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'disable') {
      onUpdateAttendant({ ...confirmAction.attendant, isActive: !confirmAction.attendant.isActive });
    } else {
      const newPassword = Math.random().toString(36).substr(2, 8);
      setGeneratedPassword({ password: newPassword, email: confirmAction.attendant.email });
      onUpdateAttendant({ ...confirmAction.attendant, password: newPassword });
    }
    setConfirmAction(null);
  };

  const renderModals = () => (
    <>
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingAttendant(null);
          setFormData({ name: '', email: '', phone: '' });
          setErrors({});
        }} 
        title={editingAttendant ? "Editar Atendente" : "Novo Atendente"}
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
          {!editingAttendant && (
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
              {editingAttendant ? 'Salvar Alterações' : 'Cadastrar Atendente'}
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
          <p>Tem certeza que deseja {confirmAction?.type === 'disable' ? (confirmAction.attendant.isActive ? 'desabilitar' : 'habilitar') : 'gerar uma nova senha para'} {confirmAction?.attendant.name}?</p>
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

  if (selectedAttendantDetails) {
    return (
      <>
        <div className="p-4 lg:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setSelectedAttendantId(null)}>
              Voltar para lista
            </Button>
            <h1 className="text-2xl font-bold text-zinc-900">Atendente: {selectedAttendantDetails.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => handleEdit(selectedAttendantDetails)}>
              <Edit2 className="h-4 w-4" /> Editar
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-amber-600 border-amber-100" onClick={() => handleDisable(selectedAttendantDetails)}>
              <UserRound className={cn("h-4 w-4", selectedAttendantDetails.isActive ? "text-amber-600" : "text-emerald-600")} /> {selectedAttendantDetails.isActive ? "Desabilitar" : "Habilitar"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-emerald-600 border-emerald-100" onClick={() => handleGeneratePassword(selectedAttendantDetails)}>
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
                  <p className="font-medium text-zinc-900 mt-1">{selectedAttendantDetails.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</label>
                  <p className="font-medium mt-1">
                    <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", selectedAttendantDetails.isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                      {selectedAttendantDetails.isActive ? 'Ativo' : 'Inativo'}
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
                  <p className="font-medium text-zinc-900 mt-1">{selectedAttendantDetails.phone}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</label>
                  <p className="font-medium text-zinc-900 mt-1 break-all">{selectedAttendantDetails.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {renderModals()}
    </>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Atendentes</h1>
          <p className="text-zinc-500">Gerencie a equipe de atendimento</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Atendente
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Buscar por nome..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-zinc-100">
            {filteredAttendants.map((attendant) => (
              <div 
                key={attendant.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-50/50 transition-colors border-b border-zinc-100 last:border-0 gap-4 cursor-pointer"
                onClick={() => setSelectedAttendantId(attendant.id)}
              >
                <div className="flex items-center gap-3 group/name text-left flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold transition-colors group-hover/name:bg-emerald-100 shrink-0">
                    {attendant.name.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-zinc-900 group-hover/name:text-emerald-600 transition-colors truncate">
                      {attendant.name}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">{attendant.email}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredAttendants.length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                Nenhum atendente encontrado.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {renderModals()}
    </div>
  );
}
