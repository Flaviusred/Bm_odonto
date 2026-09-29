import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { User, UserRole } from '../types';
import { UserPlus, Shield, Trash2, Award, Search, Filter, CheckCircle, AlertTriangle, UserX, UserCheck } from 'lucide-react';
import { cn, maskCPF, maskPhone, validateCPF } from '../lib/utils';
import { Modal } from './Modal';

interface UserManagerProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => Promise<void> | void;
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
  { id: 'attendants', label: 'Atendentes' },
  { id: 'inventory', label: 'Estoque' },
  { id: 'announcements', label: 'Avisos' },
  { id: 'audit', label: 'Histórico' },
  { id: 'settings', label: 'Configurações' },
  { id: 'users', label: 'Usuários' },
];

export function UserManager({ users, onAddUser, onDeleteUser, onUpdateUser, onUpdateUserPermissions }: UserManagerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'attendant' as UserRole, phone: '', cpf: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [confirmAction, setConfirmAction] = useState<{ type: 'password', user: User } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{ password: string, email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ name: string; role: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<User | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUser({...newUser, phone: maskPhone(e.target.value)});
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUser({ ...newUser, cpf: maskCPF(e.target.value) });
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
    if (!newUser.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório';
    } else if (!validateCPF(newUser.cpf)) {
      newErrors.cpf = 'CPF inválido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddUser = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const userName = newUser.name.trim();
    const userRole = newUser.role;
    try {
      await Promise.resolve(onAddUser({ ...newUser, cpf: newUser.cpf.replace(/\D/g, ''), permissions: [] }));
      setNewUser({ name: '', email: '', password: '', role: 'attendant', phone: '', cpf: '' });
      setErrors({});
      setIsAddModalOpen(false);
      setSuccessInfo({ name: userName, role: userRole });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Falha ao criar usuário. Tente novamente.');
    } finally {
      setIsSubmitting(false);
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
            <p className="text-zinc-500">Permissões extras são somadas ao acesso padrão de cada função.</p>
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
              <div key={user.id} className={cn('p-4 rounded-xl border space-y-2', user.isActive === false ? 'bg-zinc-100 border-zinc-200 opacity-60' : 'bg-zinc-50 border-zinc-100')}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{user.name}</p>
                      {user.isActive === false && (
                        <span className="text-xs bg-zinc-200 text-zinc-500 px-2 py-0.5 rounded-full font-medium">Inativo</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{user.email}</p>
                      <p className="text-sm text-zinc-500">CPF: {user.cpf ? maskCPF(user.cpf) : 'Não informado'}</p>
                      {user.role !== 'patient' && !user.cpf && (
                        <span className="inline-block mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Cadastro incompleto</span>
                      )}
                  </div>
                  <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      title="Resetar senha"
                      onClick={() => handleGeneratePassword(user)}
                      className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <Award className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={user.isActive === false ? 'Reativar usuário' : 'Desativar usuário'}
                      onClick={() => setToggleConfirm(user)}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        user.isActive === false
                          ? 'text-zinc-400 hover:bg-zinc-100'
                          : 'text-amber-500 hover:bg-amber-50'
                      )}
                    >
                      {user.isActive === false
                        ? <UserCheck className="h-4 w-4" />
                        : <UserX className="h-4 w-4" />}
                    </button>
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
                    <button
                      type="button"
                      title="Excluir usuário"
                      onClick={() => setDeleteConfirm(user)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
        onClose={() => { setIsAddModalOpen(false); setSubmitError(null); setErrors({}); }} 
        title="Adicionar Novo Usuário"
        closeOnBackdropClick={false}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddUser();
          }}
        >
          <Input 
            label="Nome" 
            value={newUser.name} 
            onChange={e => setNewUser({...newUser, name: e.target.value})} 
            autoComplete="name"
            error={errors.name}
          />
          <Input 
            label="Email" 
            type="email"
            value={newUser.email} 
            onChange={e => setNewUser({...newUser, email: e.target.value})} 
            autoComplete="email"
            error={errors.email}
          />
          <Input 
            label="Telefone" 
            type="tel"
            value={newUser.phone} 
            autoComplete="tel"
            onChange={handlePhoneChange}
          />
          <Input
            label="CPF"
            type="text"
            value={newUser.cpf}
            onChange={handleCpfChange}
            autoComplete="off"
            error={errors.cpf}
            required
          />
          <Input 
            label="Senha" 
            type="password"
            value={newUser.password} 
            autoComplete="new-password"
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
          {submitError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{submitError}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" style={{ opacity: 0.75 }} />
                </svg>
                Criando...
              </span>
            ) : 'Adicionar Usuário'}
          </Button>
        </form>
      </Modal>

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir Usuário"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">
              Tem certeza que deseja excluir o usuário{' '}
              <span className="font-semibold">{deleteConfirm?.name}</span>?{' '}
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (!deleteConfirm) return;
                const name = deleteConfirm.name;
                onDeleteUser(deleteConfirm.id);
                setDeleteConfirm(null);
                setDeleteSuccess(name);
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteSuccess}
        onClose={() => setDeleteSuccess(null)}
        title="Usuário Excluído"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="text-center text-zinc-700">
              O usuário <span className="font-semibold text-zinc-900">{deleteSuccess}</span> foi excluído com sucesso.
            </p>
          </div>
          <Button className="w-full" onClick={() => setDeleteSuccess(null)}>Fechar</Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!toggleConfirm}
        onClose={() => setToggleConfirm(null)}
        title={toggleConfirm?.isActive === false ? 'Reativar Usuário' : 'Desativar Usuário'}
      >
        <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${toggleConfirm?.isActive === false ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            {toggleConfirm?.isActive === false
              ? <UserCheck className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
              : <UserX className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            }
            <p className={`text-sm ${toggleConfirm?.isActive === false ? 'text-emerald-700' : 'text-amber-700'}`}>
              {toggleConfirm?.isActive === false
                ? <>Deseja reativar o usuário <span className="font-semibold">{toggleConfirm?.name}</span>? Ele voltará a ter acesso ao sistema.</>
                : <>Deseja desativar o usuário <span className="font-semibold">{toggleConfirm?.name}</span>? Ele não poderá mais acessar o sistema.</>
              }
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToggleConfirm(null)}>Cancelar</Button>
            <Button
              className={toggleConfirm?.isActive === false ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}
              onClick={() => {
                if (!toggleConfirm) return;
                onUpdateUser({ ...toggleConfirm, isActive: toggleConfirm.isActive !== false ? false : true });
                setToggleConfirm(null);
              }}
            >
              {toggleConfirm?.isActive === false ? 'Reativar' : 'Desativar'}
            </Button>
          </div>
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
        isOpen={!!successInfo}
        onClose={() => setSuccessInfo(null)}
        title="Usuário Criado"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="text-center text-zinc-700">
              O usuário <span className="font-semibold text-zinc-900">{successInfo?.name}</span> foi criado com sucesso como{' '}
              <span className="font-semibold text-zinc-900">
                {successInfo?.role === 'admin' ? 'Administrador' : successInfo?.role === 'attendant' ? 'Atendente' : successInfo?.role === 'dentist' ? 'Dentista' : 'Paciente'}
              </span>.
            </p>
          </div>
          <Button className="w-full" onClick={() => setSuccessInfo(null)}>Fechar</Button>
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
