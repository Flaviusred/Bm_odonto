import { useState, useEffect } from 'react';
import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PatientList } from './components/PatientList';
import { AgendaView } from './components/AgendaView';
import { DentistList } from './components/DentistList';
import { AttendantList } from './components/AttendantList';
import { TreatmentList } from './components/TreatmentList';
import { PatientPortal } from './components/PatientPortal';
import { DentistPortal } from './components/DentistPortal';
import { ProfileEditModal } from './components/ProfileEditModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { InventoryManager } from './components/InventoryManager';
import { AnnouncementManager } from './components/AnnouncementManager';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { DentistScheduleManager } from './components/DentistScheduleManager';
import { AuditHistory } from './components/AuditHistory';
import { UserManager } from './components/UserManager';
import { User, Patient, Dentist, Attendant, Appointment, Treatment, PatientDocument, InventoryItem, Announcement, DentistSchedule, AuditLog, InventoryMovement, UserRole } from './types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/Card';
import { formatDate, parseDate } from './lib/dateUtils';
import { Input } from './components/Input';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { Stethoscope, Mail, Lock, Calendar, XCircle, Users } from 'lucide-react';
import { emailService } from './services/emailService';
import { collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('odonto_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Check if admin exists in Firestore, if not, create it
    const checkAdmin = async () => {
      try {
        const adminId = '1';
        const adminDoc = await getDoc(doc(db, 'users', adminId));
        if (!adminDoc.exists()) {
          const admin: User = { 
            id: adminId, 
            name: 'Admin Odonto', 
            email: 'flaviano.fcp@gmail.com', 
            password: '123', 
            role: 'admin' as UserRole, 
            permissions: ['dashboard', 'patients', 'appointments', 'dentist-schedules', 'treatments', 'dentists', 'inventory', 'announcements', 'audit', 'settings', 'users'], 
            cpf: '111.111.111-11' 
          };
          await setDoc(doc(db, 'users', adminId), admin);
        }
      } catch (error) {
        console.error("Error checking/creating admin:", error);
      }
    };
    checkAdmin();
  }, []);

  const [users, setUsers] = useState<User[]>([]);

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('odonto_user');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'patient') return 'patient-profile';
      if (u.role === 'dentist') return 'dentist-appointments';
      return 'dashboard';
    }
    return 'dashboard';
  });

  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schedules, setSchedules] = useState<DentistSchedule[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [selectedDentistId, setSelectedDentistId] = useState<string>('all');

  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'info' | 'success' }[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [reminderSettings, setReminderSettings] = useState({
    emailReminders: true,
    reminderHoursBefore: 24
  });

  // Firestore Real-time Sync
  useEffect(() => {
    const collections = [
      { name: 'patients', setter: setPatients },
      { name: 'dentists', setter: setDentists },
      { name: 'attendants', setter: setAttendants },
      { name: 'appointments', setter: setAppointments },
      { name: 'treatments', setter: setTreatments },
      { name: 'documents', setter: setDocuments },
      { name: 'inventory', setter: setInventory },
      { name: 'announcements', setter: setAnnouncements },
      { name: 'schedules', setter: setSchedules },
      { name: 'movements', setter: setMovements },
      { name: 'audit_logs', setter: setAuditLogs },
      { name: 'users', setter: setUsers },
    ];

    const unsubscribes = collections.map(({ name, setter }) => {
      return onSnapshot(collection(db, name), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setter(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, name);
      });
    });

    // Sync settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'reminders'), (doc) => {
      if (doc.exists()) {
        setReminderSettings(doc.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/reminders');
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
      unsubscribeSettings();
    };
  }, [db]);

  const updateReminderSettings = async (newSettings: typeof reminderSettings) => {
    try {
      await setDoc(doc(db, 'settings', 'reminders'), newSettings);
      setReminderSettings(newSettings);
      // logAction is handled by the caller or we can add it here
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/reminders');
    }
  };

  // Persistence
  useEffect(() => {
    if (user) localStorage.setItem('odonto_user', JSON.stringify(user));
    else localStorage.removeItem('odonto_user');
  }, [user]);

  const addUser = async (data: Omit<User, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newUser: User = {
      ...data,
      id,
    };
    
    try {
      await setDoc(doc(db, 'users', id), newUser);
      
      if (newUser.role === 'attendant') {
        const newAttendant: Attendant = {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone || '',
          createdAt: new Date().toISOString(),
          isActive: true,
          password: newUser.password,
        };
        await setDoc(doc(db, 'attendants', id), newAttendant);
      } else if (newUser.role === 'dentist') {
        const newDentist: Dentist = {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone || '',
          specialty: (data as any).specialty || 'Geral',
          cro: (data as any).cro || '00000',
          createdAt: new Date().toISOString(),
          isActive: true,
          password: newUser.password,
        };
        await setDoc(doc(db, 'dentists', id), newDentist);
      }
      
      logAction('Criação', 'system', newUser.id, `Usuário ${newUser.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      await deleteDoc(doc(db, 'attendants', id));
      await deleteDoc(doc(db, 'dentists', id));
      logAction('Exclusão', 'system', id, `Usuário excluído.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${id}`);
    }
  };

  const updateUser = async (updated: User) => {
    console.log('Updating user:', updated);
    
    // Atualiza o estado do usuário logado se for o mesmo
    if (user && user.id === updated.id) {
      setUser(updated);
    }
    
    // Atualização no Firebase Firestore
    try {
      const userRef = doc(db, 'users', updated.id);
      await setDoc(userRef, updated, { merge: true });
      console.log('Usuário atualizado no Firestore com sucesso');
      
      // If user is a dentist, update the dentist record too
      if (updated.role === 'dentist') {
        const dentistRef = doc(db, 'dentists', updated.id);
        await setDoc(dentistRef, {
          name: updated.name,
          email: updated.email,
          phone: updated.phone || '',
          password: updated.password,
          cro: (updated as any).cro,
          specialty: (updated as any).specialty
        }, { merge: true });
      } else if (updated.role === 'attendant') {
        const attendantRef = doc(db, 'attendants', updated.id);
        await setDoc(attendantRef, {
          name: updated.name,
          email: updated.email,
          phone: updated.phone || '',
          password: updated.password
        }, { merge: true });
      }
      
      logAction('Edição', 'system', updated.id, `Usuário ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${updated.id}`);
    }
  };

  const updateUserPermissions = async (id: string, role: UserRole, permissions: string[]) => {
    try {
      await updateDoc(doc(db, 'users', id), { role, permissions });
      logAction('Edição', 'system', id, `Permissões do usuário atualizadas.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${id}`);
    }
  };

  const logAction = async (action: string, entityType: AuditLog['entityType'], entityId?: string, details?: string) => {
    if (!user) return;
    const id = Math.random().toString(36).substr(2, 9);
    const newLog: AuditLog = {
      id,
      userId: user.id,
      userName: user.name,
      action,
      entityType,
      entityId: entityId || '',
      details: details || `${action} em ${entityType}`,
      timestamp: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'audit_logs', id), newLog);
    } catch (error) {
      console.error("Failed to log action to Firestore", error);
    }
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (user) {
      setUser(user);
      localStorage.setItem('odonto_user', JSON.stringify(user));
      setActiveTab(user.role === 'patient' ? 'patient-profile' : user.role === 'dentist' ? 'dentist-appointments' : 'dashboard');
      logAction('Login', 'system', user.id, `Usuário ${user.name} entrou no sistema.`);
    } else {
      setLoginError('Credenciais incorretas.');
    }
  };

  const handleLogout = () => {
    if (user) logAction('Logout', 'system', user.id, `${user.name} saiu do sistema.`);
    setUser(null);
    localStorage.removeItem('odonto_user');
    setActiveTab('dashboard');
  };

  // Patient Handlers
  const addPatient = async (data: Omit<Patient, 'id' | 'createdAt' | 'isActive'> & { id?: string }) => {
    // If an ID is provided, check if the patient already exists
    if (data.id && patients.some(p => p.id === data.id)) {
      return;
    }
    
    // Check for CPF duplicate if provided (only for titulars)
    if (data.cpf && !data.dependentOf && patients.some(p => p.cpf === data.cpf && !p.dependentOf)) {
      return;
    }
    
    const id = data.id || Math.random().toString(36).substr(2, 9);
    const newPatient: Patient = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      isActive: true
    };

    try {
      await setDoc(doc(db, 'patients', id), newPatient);
      
      // Criar usuário correspondente para o portal do paciente
      const newUser: User = {
        id,
        name: newPatient.name,
        email: newPatient.email,
        password: (data as any).password || Math.random().toString(36).substr(2, 8),
        role: 'patient',
        permissions: ['patient-profile'],
        phone: newPatient.phone
      };
      await setDoc(doc(db, 'users', id), newUser);
      
      logAction('Criação', 'patient', newPatient.id, `Paciente ${newPatient.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patients');
    }
  };

  const deletePatient = async (id: string) => {
    try {
      const patient = patients.find(p => p.id === id);
      await deleteDoc(doc(db, 'patients', id));
      await deleteDoc(doc(db, 'users', id));
      logAction('Exclusão', 'patient', id, `Paciente ${patient?.name || id} excluído.`);
      
      // Delete related appointments and treatments
      const relatedAppointments = appointments.filter(a => a.patientId === id);
      for (const apt of relatedAppointments) {
        await deleteDoc(doc(db, 'appointments', apt.id));
      }
      
      const relatedTreatments = treatments.filter(t => t.patientId === id);
      for (const t of relatedTreatments) {
        await deleteDoc(doc(db, 'treatments', t.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${id}`);
    }
  };

  const updatePatient = async (updated: Patient) => {
    try {
      await setDoc(doc(db, 'patients', updated.id), updated, { merge: true });
      
      // Se o paciente tiver uma senha, atualiza o usuário correspondente
      if ((updated as any).password) {
        await setDoc(doc(db, 'users', updated.id), {
          password: (updated as any).password
        }, { merge: true });
      }

      logAction('Edição', 'patient', updated.id, `Paciente ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${updated.id}`);
    }
  };

  // Dentist Handlers
  const addDentist = async (data: Omit<Dentist, 'id' | 'createdAt' | 'isActive'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newDentist: Dentist = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      isActive: true
    };
    try {
      await setDoc(doc(db, 'dentists', id), newDentist);
      
      // Criar usuário correspondente
      const newUser: User = {
        id,
        name: newDentist.name,
        email: newDentist.email,
        password: newDentist.password,
        role: 'dentist',
        permissions: ['patients', 'appointments', 'treatments'],
        phone: newDentist.phone
      };
      await setDoc(doc(db, 'users', id), newUser);
      
      logAction('Criação', 'dentist', newDentist.id, `Dentista ${newDentist.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dentists');
    }
  };

  const deleteDentist = async (id: string) => {
    try {
      const dentist = dentists.find(d => d.id === id);
      await deleteDoc(doc(db, 'dentists', id));
      await deleteDoc(doc(db, 'users', id));
      logAction('Exclusão', 'dentist', id, `Dentista ${dentist?.name || id} excluído.`);
      
      const relatedAppointments = appointments.filter(a => a.dentistId === id);
      for (const apt of relatedAppointments) {
        await deleteDoc(doc(db, 'appointments', apt.id));
      }
      
      const relatedTreatments = treatments.filter(t => t.dentistId === id);
      for (const t of relatedTreatments) {
        await deleteDoc(doc(db, 'treatments', t.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `dentists/${id}`);
    }
  };

  const updateDentist = async (updated: Dentist) => {
    try {
      await setDoc(doc(db, 'dentists', updated.id), updated, { merge: true });
      
      // Atualizar usuário correspondente
      const userRef = doc(db, 'users', updated.id);
      await setDoc(userRef, {
        name: updated.name,
        email: updated.email,
        password: updated.password,
        phone: updated.phone
      }, { merge: true });
      
      logAction('Edição', 'dentist', updated.id, `Dentista ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `dentists/${updated.id}`);
    }
  };

  // Attendant Handlers
  const addAttendant = async (data: Omit<Attendant, 'id' | 'createdAt' | 'isActive'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newAttendant: Attendant = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      isActive: true
    };
    try {
      await setDoc(doc(db, 'attendants', id), newAttendant);
      
      // Criar usuário correspondente
      const newUser: User = {
        id,
        name: newAttendant.name,
        email: newAttendant.email,
        password: newAttendant.password,
        role: 'attendant',
        permissions: ['patients', 'appointments'],
        phone: newAttendant.phone
      };
      await setDoc(doc(db, 'users', id), newUser);
      
      logAction('Criação', 'attendant', newAttendant.id, `Atendente ${newAttendant.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendants');
    }
  };

  const deleteAttendant = async (id: string) => {
    try {
      const attendant = attendants.find(a => a.id === id);
      await deleteDoc(doc(db, 'attendants', id));
      await deleteDoc(doc(db, 'users', id));
      logAction('Exclusão', 'attendant', id, `Atendente ${attendant?.name || id} excluído.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `attendants/${id}`);
    }
  };

  const updateAttendant = async (updated: Attendant) => {
    try {
      await setDoc(doc(db, 'attendants', updated.id), updated, { merge: true });
      
      // Atualizar usuário correspondente
      const userRef = doc(db, 'users', updated.id);
      await setDoc(userRef, {
        name: updated.name,
        email: updated.email,
        password: updated.password,
        phone: updated.phone
      }, { merge: true });
      
      logAction('Edição', 'attendant', updated.id, `Atendente ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendants/${updated.id}`);
    }
  };

  // Appointment Handlers
  useEffect(() => {
    if (user?.role === 'dentist' && activeTab === 'dentist-appointments') {
      setUnseenCount(0);
    }
  }, [activeTab, user]);

  const addAppointment = async (data: Omit<Appointment, 'id' | 'createdAt'>) => {
    // Conflict detection
    const conflict = appointments.find(a => 
      a.dentistId === data.dentistId && 
      a.date === data.date && 
      a.time === data.time &&
      a.status !== 'cancelled'
    );

    if (conflict) {
      const newNotification = {
        id: Math.random().toString(36).substr(2, 9),
        message: `Conflito de horário: Este dentista já possui um agendamento para este horário.`,
        type: 'info' as const
      };
      setNotifications(prev => [...prev, newNotification]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
      }, 5000);
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const newApt: Appointment = {
      ...data,
      id,
      createdAt: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'appointments', id), newApt);
      logAction(data.status === 'blocked' ? 'Bloqueio de Horário' : 'Criação', 'appointment', newApt.id, `Agendamento para ${new Date(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`);

      // Email notification
      const patient = patients.find(p => p.id === data.patientId);
      if (patient && data.status !== 'blocked') {
        emailService.sendAppointmentEmail(
          patient.email,
          'Confirmação de Agendamento',
          `Olá ${patient.name}, seu agendamento foi confirmado para ${new Date(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`
        );
      }

      // Notification logic
      if (user?.role === 'dentist' && data.dentistId === user.id) {
        const patientName = patients.find(p => p.id === data.patientId)?.name || 'Paciente';
        const newNotification = {
          id: Math.random().toString(36).substr(2, 9),
          message: `Novo agendamento: ${patientName} em ${new Date(data.date).toLocaleDateString('pt-BR')} às ${data.time}`,
          type: 'success' as const
        };
        setNotifications(prev => [...prev, newNotification]);
        setUnseenCount(prev => prev + 1);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    }
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status });
      logAction('Atualização de Status', 'appointment', id, `Status do agendamento alterado para ${status}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${id}`);
    }
  };

  const updateAppointment = async (updatedAppointment: Appointment) => {
    try {
      await setDoc(doc(db, 'appointments', updatedAppointment.id), updatedAppointment, { merge: true });
      logAction('Edição', 'appointment', updatedAppointment.id, `Agendamento para ${new Date(updatedAppointment.date).toLocaleDateString('pt-BR')} às ${updatedAppointment.time} atualizado.`);
      
      // Email notification
      const patient = patients.find(p => p.id === updatedAppointment.patientId);
      if (patient) {
        emailService.sendAppointmentEmail(
          patient.email,
          'Atualização de Agendamento',
          `Olá ${patient.name}, seu agendamento foi atualizado para ${new Date(updatedAppointment.date).toLocaleDateString('pt-BR')} às ${updatedAppointment.time}.`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${updatedAppointment.id}`);
    }
  };

  const deleteAppointment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'appointments', id));
      
      const relatedTreatments = treatments.filter(t => t.appointmentId === id);
      for (const t of relatedTreatments) {
        await deleteDoc(doc(db, 'treatments', t.id));
      }
      
      logAction('Exclusão', 'appointment', id, `Agendamento excluído.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
    }
  };

  // Treatment Handlers
  const addTreatment = async (data: Omit<Treatment, 'id' | 'createdAt'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTreatment: Treatment = {
      ...data,
      id,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'treatments', id), newTreatment);
      logAction('Criação', 'treatment', newTreatment.id, `Tratamento ${newTreatment.description} registrado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'treatments');
    }
  };

  const updateTreatment = async (updatedTreatment: Treatment) => {
    try {
      await setDoc(doc(db, 'treatments', updatedTreatment.id), updatedTreatment, { merge: true });
      logAction('Edição', 'treatment', updatedTreatment.id, `Tratamento ${updatedTreatment.description} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `treatments/${updatedTreatment.id}`);
    }
  };

  const addDocument = async (data: Omit<PatientDocument, 'id' | 'uploadedAt'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newDoc: PatientDocument = {
      ...data,
      id,
      uploadedAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'documents', id), newDoc);
      logAction('Upload de Documento', 'patient', data.patientId, `Documento ${data.name} enviado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'documents');
    }
  };

  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordCpf, setForgotPasswordCpf] = useState('');

  useEffect(() => {
    const handleOpenProfile = () => setIsProfileEditOpen(true);
    window.addEventListener('open-profile-edit', handleOpenProfile);
    return () => window.removeEventListener('open-profile-edit', handleOpenProfile);
  }, []);

  const deleteTreatment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'treatments', id));
      logAction('Exclusão', 'treatment', id, `Tratamento excluído.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `treatments/${id}`);
    }
  };

  const updateSchedules = async (newSchedules: DentistSchedule[]) => {
    try {
      // This is a bit tricky since it's a bulk update in the UI but Firestore is doc-based.
      // We'll update each schedule.
      for (const schedule of newSchedules) {
        await setDoc(doc(db, 'schedules', schedule.id), schedule, { merge: true });
      }
      logAction('Configuração de Agenda', 'dentist', undefined, 'Os horários de atendimento foram atualizados.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'schedules');
    }
  };

  const updateInventory = async (newInventory: InventoryItem[]) => {
    try {
      for (const item of newInventory) {
        await setDoc(doc(db, 'inventory', item.id), item, { merge: true });
      }
      logAction('Atualização de Estoque', 'inventory', undefined, 'O estoque foi atualizado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const addMovement = async (movement: InventoryMovement) => {
    try {
      await setDoc(doc(db, 'movements', movement.id), movement);
      
      // Update inventory quantity
      const item = inventory.find(i => i.id === movement.itemId);
      if (item) {
        const newQuantity = movement.type === 'in' ? item.quantity + movement.quantity : item.quantity - movement.quantity;
        await updateDoc(doc(db, 'inventory', item.id), { quantity: newQuantity, lastUpdated: new Date().toISOString() });
      }
      
      logAction(movement.type === 'in' ? 'Entrada de Material' : 'Saída de Material', 'inventory', movement.itemId, `${movement.itemName}: ${movement.quantity} ${movement.type === 'in' ? 'adicionados' : 'removidos'}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'movements');
    }
  };

  const updateAnnouncements = async (newAnnouncements: Announcement[]) => {
    try {
      for (const announcement of newAnnouncements) {
        await setDoc(doc(db, 'announcements', announcement.id), announcement, { merge: true });
      }
      logAction('Atualização de Comunicados', 'announcement', undefined, 'Os comunicados foram atualizados.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'announcements');
    }
  };

  const handleForgotPassword = async () => {
    const userToUpdate = users.find(u => u.email.toLowerCase() === forgotPasswordEmail.toLowerCase() && u.cpf === forgotPasswordCpf);
    if (userToUpdate) {
      const newPassword = Math.random().toString(36).substr(2, 8);
      
      try {
        await updateDoc(doc(db, 'users', userToUpdate.id), { password: newPassword });
        
        emailService.sendPasswordResetEmail(userToUpdate.email, newPassword);
        alert('Uma nova senha foi enviada para o seu e-mail.');
        setIsForgotPasswordOpen(false);
        setForgotPasswordEmail('');
        setForgotPasswordCpf('');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userToUpdate.id}`);
      }
    } else {
      alert('Usuário não encontrado ou CPF incorreto.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-none shadow-2xl">
          <CardHeader className="space-y-4 text-center pb-8">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Stethoscope className="h-10 w-10 text-white" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight">OdontoClinic</CardTitle>
              <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 text-center">
                  {loginError}
                </div>
              )}
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-9 h-4 w-4 text-zinc-400" />
                  <Input 
                    label="Email" 
                    name="email"
                    type="email" 
                    placeholder="admin@odonto.com ou paciente@odonto.com" 
                    className="pl-10"
                    defaultValue="admin@odonto.com"
                    required 
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-9 h-4 w-4 text-zinc-400" />
                  <Input 
                    label="Senha" 
                    name="password"
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-10"
                    defaultValue="123456"
                    required 
                  />
                </div>
              </div>
              <div className="text-right">
                <button type="button" onClick={() => setIsForgotPasswordOpen(true)} className="text-sm text-emerald-600 hover:underline">
                  Esqueceu a senha?
                </button>
              </div>
              <Button type="submit" className="w-full h-12 text-lg mt-2">
                Entrar no Sistema
              </Button>
              
              <div className="mt-6 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">Credenciais de Admin:</p>
                <p className="text-xs text-zinc-400"><b>Email:</b> admin@odonto.com | <b>Senha:</b> 123</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Modal isOpen={isForgotPasswordOpen} onClose={() => setIsForgotPasswordOpen(false)} title="Recuperar Senha">
          <div className="space-y-4">
            <Input label="Email" type="email" value={forgotPasswordEmail} onChange={(e) => setForgotPasswordEmail(e.target.value)} />
            <Input label="CPF" type="text" value={forgotPasswordCpf} onChange={(e) => setForgotPasswordCpf(e.target.value)} />
            <Button onClick={handleForgotPassword} className="w-full">Enviar nova senha</Button>
          </div>
        </Modal>
      </div>
    );
  }

  const isPatient = user.role === 'patient';
  const isDentist = user.role === 'dentist';
  const patientData = isPatient ? patients.find(p => p.id === user.id) : null;
  const patientAppointments = isPatient ? appointments.filter(a => a.patientId === user.id) : [];
  const patientTreatments = isPatient ? treatments.filter(t => t.patientId === user.id) : [];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {user && (
        <ProfileEditModal 
          isOpen={isProfileEditOpen} 
          onClose={() => setIsProfileEditOpen(false)} 
          user={user}
          onUpdateUser={updateUser}
          onOpenPasswordChange={() => {
            setIsProfileEditOpen(false);
            setIsChangePasswordOpen(true);
          }}
        />
      )}
      {user && (
        <ChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          user={user}
          onUpdateUser={updateUser}
        />
      )}
      {/* Label de Desenvolvimento */}
      <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none">
        <div className="bg-yellow-500/80 backdrop-blur-sm text-white text-xs font-bold px-4 py-1 rounded-b-lg shadow-sm">
          SISTEMA EM DESENVOLVIMENTO - TESTES
        </div>
      </div>

      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onLogout={handleLogout}
        user={user ? { ...user, unseenCount } as any : undefined}
      />

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className="pointer-events-auto flex items-center gap-3 bg-white border border-emerald-100 shadow-xl rounded-2xl p-4 min-w-[320px] animate-in slide-in-from-right duration-300"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-zinc-900">Novo Agendamento</p>
              <p className="text-xs text-zinc-500">{n.message}</p>
            </div>
            <button 
              onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
              className="text-zinc-400 hover:text-zinc-600"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      
      <main className="flex-1 lg:pl-0 pt-16 lg:pt-0">
        <AnnouncementBanner announcements={announcements} userRole={user.role} />
        <div className="max-w-7xl mx-auto">
          {isPatient && patientData ? (
            <PatientPortal 
              activeTab={activeTab}
              patient={patientData}
              allPatients={patients}
              appointments={appointments}
              dentists={dentists}
              treatments={treatments}
              onUpdateProfile={updatePatient}
            />
          ) : isDentist ? (
            <DentistPortal 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              dentist={dentists.find(d => d.id === user.id) || dentists[0]}
              patients={patients}
              dentists={dentists}
              appointments={appointments}
              treatments={treatments}
              documents={documents}
              onAddAppointment={addAppointment}
              onAddTreatment={addTreatment}
              onUpdateTreatment={updateTreatment}
              onAddDocument={addDocument}
              onUpdateAppointmentStatus={updateAppointmentStatus}
              notifications={notifications}
              setNotifications={setNotifications}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard 
                  patients={patients} 
                  appointments={appointments} 
                  treatments={treatments}
                  dentists={dentists}
                />
              )}
              {activeTab === 'patients' && (
                <PatientList 
                  patients={patients} 
                  appointments={appointments}
                  treatments={treatments}
                  dentists={dentists}
                  onAddPatient={addPatient}
                  onDeletePatient={deletePatient}
                  onUpdatePatient={updatePatient}
                />
              )}
              {activeTab === 'appointments' && (
                <AgendaView 
                  appointments={appointments}
                  patients={patients}
                  dentists={dentists}
                  schedules={schedules}
                  onAddAppointment={addAppointment}
                  onUpdateStatus={updateAppointmentStatus}
                  onUpdateAppointment={updateAppointment}
                  onDeleteAppointment={deleteAppointment}
                  initialDentistId={selectedDentistId}
                />
              )}
              {activeTab === 'dentist-schedules' && (
                <DentistScheduleManager 
                  dentists={dentists}
                  appointments={appointments}
                  patients={patients}
                  schedules={schedules}
                  onAddAppointment={addAppointment}
                  onUpdateSchedules={updateSchedules}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryManager 
                  inventory={inventory}
                  movements={movements}
                  user={user}
                  onUpdateInventory={updateInventory}
                  onAddMovement={addMovement}
                />
              )}
              {activeTab === 'announcements' && (
                <AnnouncementManager 
                  announcements={announcements}
                  onUpdateAnnouncements={updateAnnouncements}
                />
              )}
              {activeTab === 'users' && (
                <UserManager 
                  users={users}
                  onAddUser={addUser}
                  onDeleteUser={deleteUser}
                  onUpdateUser={updateUser}
                  onUpdateUserPermissions={updateUserPermissions}
                />
              )}
              {activeTab === 'audit' && (
                <AuditHistory logs={auditLogs} />
              )}
              {activeTab === 'settings' && (
                <div className="p-4 lg:p-8 space-y-6">
                  <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Configurações do Sistema</h1>
                    <p className="text-zinc-500">Gerencie lembretes e preferências da clínica</p>
                  </div>
                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <CardTitle>Lembretes Automáticos</CardTitle>
                      <CardDescription>Configure como os pacientes devem ser notificados sobre suas consultas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-zinc-900">Lembretes por E-mail</p>
                          <p className="text-xs text-zinc-500">Envia um e-mail automático para o paciente.</p>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={reminderSettings.emailReminders}
                          onChange={(e) => {
                            const newSettings = { ...reminderSettings, emailReminders: e.target.checked };
                            updateReminderSettings(newSettings);
                            logAction('Configuração de Lembretes', 'system', undefined, `Lembretes por e-mail ${e.target.checked ? 'ativados' : 'desativados'}.`);
                          }}
                          className="h-5 w-5 rounded text-emerald-500 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-zinc-700">Antecedência do Lembrete (horas)</label>
                        <Input 
                          type="number" 
                          value={reminderSettings.reminderHoursBefore}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateReminderSettings({ ...reminderSettings, reminderHoursBefore: val });
                            logAction('Configuração de Lembretes', 'system', undefined, `Antecedência de lembretes alterada para ${val} horas.`);
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              {activeTab === 'dentists' && (
                <DentistList 
                  dentists={dentists}
                  onAddDentist={addDentist}
                  onDeleteDentist={deleteDentist}
                  onUpdateDentist={updateDentist}
                  onTabChange={setActiveTab}
                  onSelectDentist={setSelectedDentistId}
                />
              )}
              {activeTab === 'attendants' && (
                <AttendantList 
                  attendants={attendants}
                  onAddAttendant={addAttendant}
                  onDeleteAttendant={deleteAttendant}
                  onUpdateAttendant={updateAttendant}
                />
              )}
              {activeTab === 'treatments' && (
                <TreatmentList 
                  treatments={treatments}
                  patients={patients}
                  dentists={dentists}
                  appointments={appointments}
                  onAddTreatment={addTreatment}
                  onDeleteTreatment={deleteTreatment}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
