import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Stethoscope, 
  UserRound, 
  LogOut,
  Menu,
  X,
  Package,
  Bell,
  Settings,
  CalendarPlus,
  History,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp,
  PieChart
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getEffectivePermissions } from '../lib/permissions';
import { Button } from './Button';
import { useState, useRef, useEffect } from 'react';
import { User } from '../types';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  user?: User;
}

export function Sidebar({ activeTab, onTabChange, onLogout, user }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const dashboardButtonRef = useRef<HTMLButtonElement | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (dashboardButtonRef.current) {
      setTimeout(() => {
        try { dashboardButtonRef.current?.focus(); } catch {}
      }, 0);
    }
  }, [isDashboardOpen]);

  useEffect(() => {
    // After toggling settings, restore focus to the settings button (deferred)
    if (settingsButtonRef.current) {
      setTimeout(() => {
        try { settingsButtonRef.current?.focus(); } catch {}
      }, 0);
    }
  }, [isSettingsOpen]);

  const dashboardSubItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'dashboard-period', label: 'Atendimentos por Período', icon: Calendar },
    { id: 'dashboard-by-type', label: 'Atend. por Tipo de Usuário', icon: Users },
    { id: 'dashboard-by-dentist', label: 'Agendamentos por Dentista', icon: UserRound },
    { id: 'dashboard-by-status', label: 'Agendamentos por Status', icon: PieChart },
    { id: 'dashboard-export-sheet', label: 'Gerar Planilha (Excel)', icon: FileSpreadsheet },
    { id: 'dashboard-export-pdf', label: 'Gerar PDF', icon: FileText },
  ];

  const adminItems = [
    { id: 'dentists', label: 'Dentistas', icon: UserRound },
    { id: 'patients', label: 'Pacientes', icon: Users },
    { id: 'attendants', label: 'Atendentes', icon: UserRound },
    { id: 'treatments', label: 'Tratamentos', icon: Stethoscope },
    { id: 'appointments', label: 'Agendamentos', icon: Calendar },
    { id: 'dentist-schedules', label: 'Gestão de Agenda', icon: CalendarPlus },
    { id: 'inventory', label: 'Estoque', icon: Package },
    { id: 'announcements', label: 'Avisos', icon: Bell },
    { id: 'audit', label: 'Histórico', icon: History },
  ];

  const settingsSubItems = [
    { id: 'users', label: 'Gestão de Usuários', icon: Users },
    { id: 'settings', label: 'Configurações Gerais', icon: Settings },
  ];

  const patientItems = [
    { id: 'patient-profile', label: 'Meu Perfil', icon: UserRound },
    { id: 'patient-appointments', label: 'Meus Agendamentos', icon: Calendar },
    { id: 'patient-treatments', label: 'Meu Prontuário', icon: Stethoscope },
  ];

  const dentistItems = [
    { id: 'dentist-appointments', label: 'Minha Agenda', icon: Calendar },
    { id: 'dentist-patients', label: 'Pacientes', icon: Users },
    { id: 'dentist-treatments', label: 'Meus Atendimentos', icon: Stethoscope },
  ];

  const roleBaseItems = user?.role === 'patient'
    ? patientItems
    : user?.role === 'dentist'
      ? dentistItems
      : [];

  const effectivePermissions = getEffectivePermissions(user);
  const extraItems = [...adminItems, ...settingsSubItems];
  const menuItems = user?.role === 'admin'
    ? adminItems
    : [
        ...roleBaseItems,
        ...extraItems.filter(
          (item) => effectivePermissions.includes(item.id) && !roleBaseItems.some((baseItem) => baseItem.id === item.id)
        ),
      ];

  // Agrupamento visual para o menu do admin
  const groupedAdmin = [
    {
      title: 'Principal',
      items: [
        { id: 'dentists', label: 'Dentistas', icon: UserRound },
        { id: 'patients', label: 'Pacientes', icon: Users },
        { id: 'attendants', label: 'Atendentes', icon: UserRound },
        { id: 'treatments', label: 'Tratamentos', icon: Stethoscope },
        { id: 'appointments', label: 'Agendamentos', icon: Calendar },
        { id: 'dentist-schedules', label: 'Gestão de Agenda', icon: CalendarPlus },
      ]
    },
    {
      title: 'Auxiliares',
      items: [
        { id: 'inventory', label: 'Estoque', icon: Package },
        { id: 'announcements', label: 'Avisos', icon: Bell },
        { id: 'audit', label: 'Histórico', icon: History },
      ]
    }
  ];

  const renderNavButton = (item: { id: string; label: string; icon: any }) => (
    <button
      type="button"
      key={item.id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onTabChange(item.id);
        setIsOpen(false);
      }}
      className={cn(
        'w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group relative',
        activeTab === item.id
          ? 'bg-emerald-500/10 text-emerald-400 font-medium'
          : 'hover:bg-zinc-900 hover:text-zinc-200'
      )}
    >
      <div className="flex items-center gap-3">
        <item.icon className={cn(
          'h-5 w-5 transition-colors',
          activeTab === item.id ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
        )} />
        <span className="text-sm">{item.label}</span>
      </div>
      {activeTab === item.id && (
        <div className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full" />
      )}
      {item.id === 'dentist-appointments' && user?.role === 'dentist' && (user as any).unseenCount > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-lg shadow-emerald-500/40">
          {(user as any).unseenCount}
        </span>
      )}
    </button>
  );

  const NavContent = () => (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-400 p-4 border-r border-zinc-800/50">
      <div className="flex items-center gap-3 px-2 py-6 mb-8">
        <div className="h-10 w-10 flex items-center justify-center p-0">
          <img src="/brasao-BM.png" alt="Logo Bombeiros" className="w-full h-full object-contain rounded-lg" referrerPolicy="no-referrer" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold text-white tracking-tight leading-none">Diretoria de Saúde</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-medium">Sistema de Gestão</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto pr-2 custom-scrollbar">
        {user?.role === 'admin' ? (
          <>
            <div className="mb-4">
              <button
                type="button"
                ref={dashboardButtonRef}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsDashboardOpen(prev => !prev);
                  setTimeout(() => {
                    try { dashboardButtonRef.current?.focus(); } catch {}
                  }, 50);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <LayoutDashboard className="h-5 w-5" />
                  <span className="text-sm">Dashboard</span>
                </div>
                {isDashboardOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isDashboardOpen && (
                <div className="pl-4 mt-1 space-y-1">
                  {dashboardSubItems.map((subItem) => (
                    <button
                      type="button"
                      key={subItem.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onTabChange(subItem.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-all duration-200',
                        activeTab === subItem.id
                          ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
                      )}
                    >
                      <subItem.icon className="h-4 w-4" />
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {groupedAdmin.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{group.title}</div>
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => renderNavButton(item))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {menuItems.map((item) => renderNavButton(item))}
          </>
        )}

        {user?.role === 'admin' && (
          <div className="pt-2">
            <button
              type="button"
              ref={settingsButtonRef}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsSettingsOpen(prev => !prev);
                setTimeout(() => {
                  try { settingsButtonRef.current?.focus(); } catch {}
                }, 50);
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5" />
                <span className="text-sm">Configurações</span>
              </div>
              {isSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {isSettingsOpen && (
              <div className="pl-4 mt-1 space-y-1">
                {settingsSubItems.map((subItem) => (
                  <button
                    type="button"
                    key={subItem.id}
                    onClick={() => {
                      onTabChange(subItem.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-all duration-200',
                      activeTab === subItem.id
                        ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
                    )}
                  >
                    <subItem.icon className="h-4 w-4" />
                    {subItem.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="mt-auto pt-6 border-t border-zinc-800/50 space-y-4">
        {user && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-zinc-900/50 border border-zinc-800/30">
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.name}&background=10b981&color=fff`} 
              alt={user.name}
              className="h-9 w-9 rounded-full border border-emerald-500/30 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-500 truncate uppercase tracking-tight">
                {user.role === 'admin' ? 'Administrador' : user.role === 'dentist' ? 'Dentista' : user.role === 'attendant' ? 'Atendente' : 'Paciente'}
              </p>
            </div>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-profile-edit'))} className="text-zinc-500 hover:text-white">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        )}
        <Button 
          variant="ghost" 
          className="w-full justify-start text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl h-11"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 mr-3" />
          <span className="text-sm">Sair do Sistema</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-800/50 flex items-center justify-between px-4 z-40 backdrop-blur-md bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 flex items-center justify-center p-0">
            <img src="/brasao-BM.png" alt="Logo Bombeiros" className="w-full h-full object-contain rounded-lg" referrerPolicy="no-referrer" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Diretoria de Saúde</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="text-zinc-400 hover:text-white hover:bg-zinc-900">
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Drawer */}
      <div className={cn(
        "fixed inset-0 z-50 lg:hidden transition-all duration-300",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsOpen(false)} />
        <div className={cn(
          "absolute inset-y-0 left-0 w-72 transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <NavContent />
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-4 right-4 text-zinc-500 hover:text-white hover:bg-zinc-800/50 rounded-full"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 h-screen sticky top-0 z-30">
        <NavContent />
      </aside>
    </>
  );
}
