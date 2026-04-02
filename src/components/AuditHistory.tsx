import React from 'react';
import { AuditLog } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { History, Search, Filter, User, Calendar, Tag } from 'lucide-react';
import { cn } from '../lib/utils';

interface AuditHistoryProps {
  logs: AuditLog[];
}

export function AuditHistory({ logs }: AuditHistoryProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterType, setFilterType] = React.useState<string>('all');

  const filteredLogs = logs
    .filter(log => {
      const matchesSearch = 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = filterType === 'all' || log.entityType === filterType;
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getEntityColor = (type: AuditLog['entityType']) => {
    switch (type) {
      case 'patient': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'dentist': return 'text-purple-600 bg-purple-50 border-purple-100';
      case 'appointment': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'treatment': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'inventory': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'announcement': return 'text-pink-600 bg-pink-50 border-pink-100';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100';
    }
  };

  const translateEntityType = (type: AuditLog['entityType']) => {
    const types: Record<string, string> = {
      'patient': 'Paciente',
      'dentist': 'Dentista',
      'appointment': 'Agendamento',
      'treatment': 'Tratamento',
      'inventory': 'Estoque',
      'announcement': 'Comunicado',
      'system': 'Sistema'
    };
    return types[type] || type;
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Histórico de Auditoria</h1>
          <p className="text-zinc-500">Acompanhe todas as ações realizadas no sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por usuário, ação ou detalhes..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <select
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all appearance-none bg-white"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Todos os Tipos</option>
            <option value="patient">Pacientes</option>
            <option value="dentist">Dentistas</option>
            <option value="appointment">Agendamentos</option>
            <option value="treatment">Tratamentos</option>
            <option value="inventory">Estoque</option>
            <option value="announcement">Comunicados</option>
            <option value="system">Sistema</option>
          </select>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-bottom border-zinc-100">
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data/Hora</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Usuário</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Ação</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Tipo</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                          <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-600">
                            {log.userName.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-zinc-900">{log.userName}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-zinc-700">{log.action}</span>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-1 rounded-full border",
                          getEntityColor(log.entityType)
                        )}>
                          {translateEntityType(log.entityType)}
                        </span>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-zinc-500 max-w-md truncate" title={log.details}>
                          {log.details}
                        </p>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <History className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
                      <p className="text-zinc-500">Nenhum registro encontrado no histórico.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-zinc-100">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-600">
                        {log.userName.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-zinc-900">{log.userName}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-1 rounded-full border",
                      getEntityColor(log.entityType)
                    )}>
                      {translateEntityType(log.entityType)}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-700">{log.action}</div>
                  <p className="text-sm text-zinc-500">{log.details}</p>
                  <div className="text-xs text-zinc-400 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-zinc-500">
                <History className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
                Nenhum registro encontrado no histórico.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
