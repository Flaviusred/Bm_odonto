import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { User, UserRole } from '../types';
import { UserPlus, Shield, Trash2, Award, Search, Filter } from 'lucide-react';
import { cn, maskPhone } from '../lib/utils';
import { Modal } from './Modal';

interface UserManagerProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => void;
  onDeleteUser: (id: string) => void;
  onUpdateUser: (user: User) => void;
  onUpdateUserPermissions: (id: string, role: UserRole, permissions: string[]) => void;
}

const availablePermissions = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'patients', label: 'Pacientes' },
  { id: 'appointments', label: 'Agendamentos' },
  { id: 'dentist-schedules', label: 'Gestão de Agenda' },
  { id: 'treatments', label: 'Tratamentos' },
  { id: 'dentists', label: 'Dentistas' },
  { id: 'inventory', label: 'Estoque' },
  { id: 'announcements', label: 'Avisos' },
  { id: 'audit', label: 'Histórico' },
  { id: 'settings', label: 'Configurações' },
  { id: 'users', label: 'Usuários' },
];

export function UserManager({ users, onAddUser, onDeleteUser, onUpdateUser, onUpdateUserPermissions }: UserManagerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'attendant' as UserRole, phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [confirmAction, setConfirmAction] = useState<{ type: 'password', user: User } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{ password: string, email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUser({...newUser, phone: maskPhone(e.target.value)});
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!newUser.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!newUser.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) {
      newErrors.email = 'Email inválido';
    }
    if (!newUser.password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (newUser.password.length < 6) {
      newErrors.password = 'A senha deve ter pelo menos 6 caracteres';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddUser = () => {
    if (validate()) {
      onAddUser({ ...newUser, permissions: [] });
      setNewUser({ name: '', email: '', password: '', role: 'attendant', phone: '' });
      setIsAddModalOpen(false);
    }
  };

  const handleGeneratePassword = (user: User) => {
    setConfirmAction({ type: 'password', user });
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
    if (confirmAction.type === 'password') {
      const newPassword = Math.random().toString(36).substr(2, 8);
      setGeneratedPassword({ password: newPassword, email: confirmAction.user.email });
      onUpdateUser({ ...confirmAction.user, password: newPassword });
    }
    setConfirmAction(null);
  };

  const filteredUsers = users.filter(user => {
    const matchesName = user.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesName && matchesRole;
  });

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-4 w-full">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Gestão de Usuários e Permissões</h1>
            <p className="text-zinc-500">Gerencie as permissões dos usuários cadastrados.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input 
                placeholder="Buscar por nome..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 sm:hidden" />
              <select 
                value={roleFilter} 
                onChange={e => setRoleFilter(e.target.value as UserRole | 'all')} 
                className="w-full sm:w-auto p-2 pl-3 sm:pl-3 border border-zinc-300 rounded-xl text-sm h-10 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="all">Todas as funções</option>
                <option value="admin">Administrador</option>
                <option value="dentist">Dentista</option>
                <option value="attendant">Atendente</option>
                <option value="patient">Paciente</option>
              </select>
            </div>
          </div>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 h-10 shrink-0">
          <UserPlus className="h-4 w-4" />
          <span className="whitespace-nowrap">Novo Usuário</span>
        </Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-500" />
            Usuários Cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...filteredUsers].sort((a, b) => {
              const order: Record<UserRole, number> = { 'dentist': 1, 'patient': 2, 'attendant': 3, 'admin': 4 };
              return (order[a.role] || 5) - (order[b.role] || 5);
            }).map(user => (
              <div key={user.id} className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 space-y-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-zinc-500">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button variant="ghost" size="icon" onClick={() => handleGeneratePassword(user)} className="text-emerald-600">
                      <Award className="h-4 w-4" />
                    </Button>
                    <select
                      value={user.role}
                      onChange={(e) => onUpdateUserPermissions(user.id, e.target.value as UserRole, user.permissions)}
                      className="p-2 border border-zinc-300 rounded-lg text-sm flex-1 sm:flex-none"
                    >
                      <option value="admin">Administrador</option>
                      <option value="dentist">Dentista</option>
                      <option value="attendant">Atendente</option>
                      <option value="patient">Paciente</option>
                    </select>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteUser(user.id)} className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availablePermissions.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => onUpdateUserPermissions(user.id, user.role, (user.permissions || []).includes(p.id) ? (user.permissions || []).filter(perm => perm !== p.id) : [...(user.permissions || []), p.id])}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                        (user.permissions || []).includes(p.id)
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        title="Adicionar Novo Usuário"
      >
        <div className="space-y-4">
          <Input 
            label="Nome" 
            value={newUser.name} 
            onChange={e => setNewUser({...newUser, name: e.target.value})} 
            error={errors.name}
          />
          <Input 
            label="Email" 
            type="email"
            value={newUser.email} 
            onChange={e => setNewUser({...newUser, email: e.target.value})} 
            error={errors.email}
          />
          <Input 
            label="Telefone" 
            type="tel"
            value={newUser.phone} 
            onChange={handlePhoneChange}
          />
          <Input 
            label="Senha" 
            type="password"
            value={newUser.password} 
            onChange={e => setNewUser({...newUser, password: e.target.value})} 
            error={errors.password}
          />
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Função</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
              className="w-full p-2 border border-zinc-300 rounded-lg text-sm"
            >
              <option value="attendant">Atendente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <Button onClick={handleAddUser} className="w-full">Adicionar Usuário</Button>
        </div>
      </Modal>

      <Modal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        title="Confirmar Geração de Senha"
      >
        <div className="space-y-4">
          <p>Tem certeza que deseja gerar uma nova senha para {confirmAction?.user.name}?</p>
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
            A senha foi atualizada no cadastro do usuário.
          </p>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setGeneratedPassword(null)}>Fechar</Button>
            <Button onClick={handleCopyPassword}>Copiar Senha</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
