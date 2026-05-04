import { useEffect, useMemo, useState } from 'react';
import { 
  Users, 
  Calendar, 
  Stethoscope, 
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  PieChart as PieChartIcon,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { cn } from '../lib/utils';
import { formatDateDDMMYYYY, parseDate, parseDateTime } from '../lib/dateUtils';
import { Patient, Appointment, Treatment, Dentist } from '../types';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  treatments: Treatment[];
  dentists: Dentist[];
  view?: 'overview' | 'period' | 'by-type' | 'by-dentist' | 'by-status';
}

type PeriodKey = '7d' | '30d' | '90d' | 'year' | 'all';

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'year', label: 'Este ano' },
  { key: 'all', label: 'Todo período' },
];

const ATTENDED_STATUSES = new Set(['concluído', 'completed']);

const PATIENT_TYPE_LABELS: Record<string, string> = {
  cbmpb: 'CBMPB',
  security: 'Segurança Pública',
  civil: 'Civil',
};

export function Dashboard({ patients, appointments, treatments, dentists, view = 'overview' }: DashboardProps) {
  const [chartsReady, setChartsReady] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  useEffect(() => {
    const id = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const appointmentsToday = appointments.filter(a => {
    return a.date === todayStr;
  });

  const periodStartDate = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (selectedPeriod === 'all') return null;
    if (selectedPeriod === 'year') {
      return new Date(today.getFullYear(), 0, 1);
    }

    const dayMap: Record<'7d' | '30d' | '90d', number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };

    start.setDate(start.getDate() - dayMap[selectedPeriod] + 1);
    return start;
  }, [selectedPeriod, today]);

  const appointmentsInPeriod = useMemo(() => {
    if (!periodStartDate) return appointments;
    const startTime = periodStartDate.getTime();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();

    return appointments.filter((appointment) => {
      const when = parseDate(appointment.date).getTime();
      return when >= startTime && when <= endOfToday;
    });
  }, [appointments, periodStartDate, today]);

  const attendedInPeriod = useMemo(() => {
    return appointmentsInPeriod.filter((appointment) => ATTENDED_STATUSES.has(String(appointment.status || '').toLowerCase()));
  }, [appointmentsInPeriod]);

  const attendedByPatientType = useMemo(() => {
    const patientTypeById = new Map(patients.map((patient) => [patient.id, patient.patientType]));
    const base = {
      cbmpb: 0,
      security: 0,
      civil: 0,
    };

    attendedInPeriod.forEach((appointment) => {
      const patientType = patientTypeById.get(appointment.patientId);
      if (patientType && patientType in base) {
        base[patientType] += 1;
      }
    });

    return [
      { key: 'cbmpb', name: PATIENT_TYPE_LABELS.cbmpb, value: base.cbmpb },
      { key: 'security', name: PATIENT_TYPE_LABELS.security, value: base.security },
      { key: 'civil', name: PATIENT_TYPE_LABELS.civil, value: base.civil },
    ];
  }, [attendedInPeriod, patients]);
  
  const stats = [
    { label: 'Total Pacientes', value: patients.length.toString(), icon: Users, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Agendamentos Hoje', value: appointmentsToday.length.toString(), icon: Calendar, color: 'bg-emerald-500/10 text-emerald-500' },
    { label: 'Tratamentos Realizados', value: treatments.length.toString(), icon: Stethoscope, color: 'bg-purple-500/10 text-purple-500' },
    { label: 'Dentistas Ativos', value: dentists.length.toString(), icon: Users, color: 'bg-orange-500/10 text-orange-500' },
  ];

  // Group appointments by month for the chart
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const chartData = months.map((month, index) => {
    const count = appointments.filter(a => parseDate(a.date).getMonth() === index).length;
    return { name: month, appointments: count };
  }).slice(0, new Date().getMonth() + 1);

  // Appointments by status — filtrado por período
  const statusCounts = useMemo(() => appointmentsInPeriod.reduce((acc, apt) => {
    acc[apt.status] = (acc[apt.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [appointmentsInPeriod]);
  
  const STATUS_LABELS: Record<string, string> = {
    'Agendado': 'Agendado',
    'Confirmado': 'Confirmado',
    'Cancelado': 'Cancelado',
    'Concluído': 'Concluído',
    'Bloqueado': 'Bloqueado',
    'scheduled': 'Agendado',
    'confirmed': 'Confirmado',
    'cancelled': 'Cancelado',
    'completed': 'Concluído',
    'blocked': 'Bloqueado',
  };

  const statusData = useMemo(() => {
    const merged: Record<string, number> = {};
    Object.entries(statusCounts).forEach(([key, count]) => {
      const label = STATUS_LABELS[key] ?? key;
      merged[label] = (merged[label] || 0) + count;
    });
    return Object.entries(merged).map(([name, value]) => ({ name, value }));
  }, [statusCounts]);
  const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#64748b'];

  // Appointments by dentist — filtrado por período
  const dentistData = useMemo(() => {
    const dentistCounts = appointmentsInPeriod.reduce((acc, apt) => {
      const dentist = dentists.find(d => d.id === apt.dentistId)?.name || 'Desconhecido';
      acc[dentist] = (acc[dentist] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(dentistCounts).map(([name, value]) => ({ name, value }));
  }, [appointmentsInPeriod, dentists]);

  const recentAppointments = appointments
    .sort((a, b) => parseDateTime(b.date, b.time).getTime() - parseDateTime(a.date, a.time).getTime())
    .slice(0, 4);

  const getPatientName = (id: string) => patients.find(p => p.id === id)?.name || 'Paciente';

  // Filtro de período reutilizável
  const PeriodFilter = () => (
    <div className="flex flex-wrap gap-2">
      {PERIOD_OPTIONS.map((period) => (
        <button
          key={period.key}
          type="button"
          onClick={() => setSelectedPeriod(period.key)}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors border',
            selectedPeriod === period.key
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-8 p-4 lg:p-8">
      {/* Filtro de período — exibido em todas as views exceto visão geral */}
      {view !== 'overview' && (
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-zinc-600 flex items-center gap-2"><Filter className="h-4 w-4" /> Período:</span>
            <PeriodFilter />
          </CardContent>
        </Card>
      )}
      {/* Stats cards — mostrados em todas as views */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center', stat.color)}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
                <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fluxo mensal + Últimos agendamentos — apenas na visão geral */}
      {view === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Fluxo de Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorApp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="appointments" stroke="#10b981" fillOpacity={1} fill="url(#colorApp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-500" />
              Últimos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentAppointments.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-sm font-bold text-emerald-600 border border-zinc-100">
                      {getPatientName(apt.patientId).charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{getPatientName(apt.patientId)}</p>
                      <p className="text-xs text-zinc-500">{formatDateDDMMYYYY(apt.date)} • {apt.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {apt.status === 'Concluído' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {apt.status === 'Confirmado' && <Clock className="h-5 w-5 text-blue-500" />}
                    {apt.status === 'Agendado' && <Clock className="h-5 w-5 text-zinc-400" />}
                    {apt.status === 'Cancelado' && <XCircle className="h-5 w-5 text-red-500" />}
                  </div>
                </div>
              ))}
              {recentAppointments.length === 0 && (
                <p className="text-center py-8 text-zinc-400 text-sm italic">Nenhum agendamento recente.</p>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Atendimentos por Período */}
      {(view === 'overview' || view === 'period') && (
        <div className={view === 'overview' ? 'grid grid-cols-1 lg:grid-cols-2 gap-8' : 'grid grid-cols-1 gap-8'}>
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Filter className="h-5 w-5 text-emerald-500" />
              Atendimentos por Período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {view === 'overview' && <PeriodFilter />}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {attendedByPatientType.map((item) => (
                <div key={item.key} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{item.name}</p>
                  <p className="text-2xl font-bold text-zinc-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <p className="text-sm text-emerald-700">Total de atendimentos concluídos no período selecionado</p>
              <p className="text-3xl font-bold text-emerald-700">{attendedInPeriod.length}</p>
            </div>
          </CardContent>
        </Card>

        {/* Agendamentos por Status — ao lado do período na visão geral */}
        {view === 'overview' && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-emerald-500" />
              Agendamentos por Status
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                  {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        )}
        </div>
      )}

      {/* Atendimentos por Tipo de Usuário — isolado */}
      {(view === 'overview' || view === 'by-type') && (
        <div className={view === 'overview' ? 'grid grid-cols-1 lg:grid-cols-2 gap-8' : 'grid grid-cols-1 gap-8'}>
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-500" />
              Atendimentos por Tipo de Usuário
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={attendedByPatientType}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Agendamentos por Dentista — ao lado na visão geral */}
        {view === 'overview' && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-emerald-500" />
              Agendamentos por Dentista
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={dentistData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        )}
        </div>
      )}

      {/* Agendamentos por Status — isolado */}
      {view === 'by-status' && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-emerald-500" />
              Agendamentos por Status
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130} fill="#8884d8" label>
                  {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agendamentos por Dentista — isolado */}
      {view === 'by-dentist' && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-emerald-500" />
              Agendamentos por Dentista
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            {!chartsReady ? <div className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={dentistData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
