export type UserRole = 'admin' | 'dentist' | 'patient' | 'attendant';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  permissions: string[];
  photoURL?: string;
  cpf?: string;
  phone?: string;
}

export type PatientType = 'cbmpb' | 'security' | 'civil';
export type SecurityType = 'pm' | 'pc' | 'pp';

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  address: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  anamnesis?: string;
  authUid?: string;
  createdAt: string;
  isActive: boolean;
  patientType: PatientType;
  securityType?: SecurityType; // Para quando for 'security'
  registrationNumber?: string; // Para CBMPB ou Segurança Pública
  functionalCategory?: string; // Categoria funcional (ex: Soldado, Cabo, etc)
  dependentOf?: string; // ID do titular se for dependente
  parentesco?: string; // Grau de parentesco se for dependente
}

export interface Dentist {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  cro: string;
  createdAt: string;
  isActive: boolean;
  password?: string;
  authUid?: string;
}

export interface Attendant {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  isActive: boolean;
  password?: string;
  authUid?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  date: string;
  time: string;
  status: 'Agendado' | 'Confirmado' | 'Cancelado' | 'Concluído' | 'Bloqueado';
  notes?: string;
  createdAt: string;
  googleEventId?: string;
  patientAuthUid?: string | null;
  dentistAuthUid?: string | null;
}

export interface Treatment {
  id: string;
  patientId: string;
  dentistId: string;
  appointmentId: string;
  description: string;
  type?: 'Limpeza' | 'Extração' | 'Obturação' | 'Canal' | 'Ortodontia' | 'Outro';
  date: string;
  createdAt: string;
  patientAuthUid?: string | null;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  type: 'Exame' | 'Documento' | 'Raio-X';
  url: string;
  uploadedAt: string;
  patientAuthUid?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  category: string;
  lastUpdated: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'entrada' | 'saida';
  quantity: number;
  reason: string;
  date: string;
  userId: string;
  userName: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  link?: string;
  mediaUrl?: string;
  targetRoles: UserRole[];
  createdAt: string;
  active: boolean;
}

export interface DentistSchedule {
  id: string;
  dentistId: string;
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string;
  endTime: string;
  slotDuration: number; // in minutes
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: 'patient' | 'dentist' | 'attendant' | 'appointment' | 'treatment' | 'inventory' | 'announcement' | 'system';
  entityId?: string;
  details: string;
  timestamp: string;
}
