import { useState, useEffect } from 'react';
import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PatientList } from './components/PatientList';
import { AgendaView } from './components/AgendaView';
import { DentistList } from './components/DentistList';
import { AttendantList } from './components/AttendantList';
import { TreatmentList } from './components/TreatmentList';
// AppointmentList was moved to _cleanup/ (replaced by AgendaView)
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
import { Mail, Lock, Calendar, XCircle, Users } from 'lucide-react';
import { emailService } from './services/emailService';
import LoadingOverlay from './components/LoadingOverlay';
import { subscribe as subscribeLoading, runWithLoading } from './lib/loadingStore';
import { collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc, getDoc, query, where, deleteField } from 'firebase/firestore';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, createAuthUserWithSecondaryApp } from './firebase';

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
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeLoading((v) => setGlobalLoading(v));
    return unsub;
  }, []);
  const [user, setUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem('odonto_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);


  const [users, setUsers] = useState<User[]>([]);

  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('odonto_user');
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
  const dentistSeenAppointmentIdsRef = React.useRef<Set<string>>(new Set());
  const dentistNotifInitializedRef = React.useRef(false);
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

  const stripPassword = <T extends Record<string, any>>(obj: T): Omit<T, 'password'> => {
    const { password, ...safe } = obj;
    return safe;
  };

  const clearLegacyPasswords = async (id: string) => {
    await setDoc(doc(db, 'users', id), { password: deleteField() }, { merge: true });
    await setDoc(doc(db, 'patients', id), { password: deleteField() }, { merge: true }).catch(() => {});
    await setDoc(doc(db, 'dentists', id), { password: deleteField() }, { merge: true }).catch(() => {});
    await setDoc(doc(db, 'attendants', id), { password: deleteField() }, { merge: true }).catch(() => {});
  };

  // Persistence
  useEffect(() => {
    if (user) sessionStorage.setItem('odonto_user', JSON.stringify(user));
    else sessionStorage.removeItem('odonto_user');
  }, [user]);

  const addUser = async (data: Omit<User, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const email = data.email.trim().toLowerCase();
    const password = (data as any).password as string | undefined;

    if (!password || password.length < 6) {
      throw new Error('Senha deve ter pelo menos 6 caracteres para criar conta no Firebase Auth.');
    }

    const authUid = await createAuthUserWithSecondaryApp(email, password);
    const newUser: User & { authUid?: string } = {
      ...(stripPassword(data as any) as Omit<User, 'id'>),
      id,
      email,
      authUid,
    };
    
    try {
      await runWithLoading(async () => {
        await setDoc(doc(db, 'users', id), newUser);

        if (newUser.role === 'attendant') {
          const newAttendant: Attendant = {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone || '',
            createdAt: new Date().toISOString(),
            isActive: true,
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
          };
          await setDoc(doc(db, 'dentists', id), newDentist);
        }
      });

      logAction('Criação', 'system', newUser.id, `Usuário ${newUser.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await runWithLoading(async () => {
        await deleteDoc(doc(db, 'users', id));
        await deleteDoc(doc(db, 'attendants', id));
        await deleteDoc(doc(db, 'dentists', id));
      });
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
      await runWithLoading(async () => {
        const userRef = doc(db, 'users', updated.id);
        const safeUpdated = stripPassword(updated as any);
        await setDoc(userRef, safeUpdated, { merge: true });
        await setDoc(userRef, { password: deleteField() }, { merge: true });
        console.log('Usuário atualizado no Firestore com sucesso');

        if ((updated as any).password && updated.email) {
          await sendPasswordResetEmail(auth, updated.email.toLowerCase()).catch(() => {});
        }

        // If user is a dentist, update the dentist record too
        if (updated.role === 'dentist') {
          const dentistRef = doc(db, 'dentists', updated.id);
          await setDoc(dentistRef, {
            name: updated.name,
            email: updated.email,
            phone: updated.phone || '',
            cro: (updated as any).cro,
            specialty: (updated as any).specialty
          }, { merge: true });
          await setDoc(dentistRef, { password: deleteField() }, { merge: true }).catch(() => {});
        } else if (updated.role === 'attendant') {
          const attendantRef = doc(db, 'attendants', updated.id);
          await setDoc(attendantRef, {
            name: updated.name,
            email: updated.email,
            phone: updated.phone || '',
          }, { merge: true });
          await setDoc(attendantRef, { password: deleteField() }, { merge: true }).catch(() => {});
        }
      });

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

  const resolveLegacyUserByCredentials = (email: string, password: string): (User & { authUid?: string }) | null => {
    const normalizedEmail = email.trim().toLowerCase();

    const directUser = users.find((u: any) => u.email?.toLowerCase() === normalizedEmail && u.password === password);
    if (directUser) {
      return stripPassword(directUser as any) as User;
    }

    const legacyDentist = dentists.find((d: any) => d.email?.toLowerCase() === normalizedEmail && d.password === password);
    if (legacyDentist) {
      const existingUser = users.find(u => u.id === legacyDentist.id || u.email.toLowerCase() === normalizedEmail);
      return {
        id: existingUser?.id || legacyDentist.id,
        name: existingUser?.name || legacyDentist.name,
        email: normalizedEmail,
        role: existingUser?.role || 'dentist',
        permissions: existingUser?.permissions || ['patients', 'appointments', 'treatments'],
        phone: existingUser?.phone || legacyDentist.phone,
        photoURL: existingUser?.photoURL,
        cpf: existingUser?.cpf,
      };
    }

    const legacyAttendant = attendants.find((a: any) => a.email?.toLowerCase() === normalizedEmail && a.password === password);
    if (legacyAttendant) {
      const existingUser = users.find(u => u.id === legacyAttendant.id || u.email.toLowerCase() === normalizedEmail);
      return {
        id: existingUser?.id || legacyAttendant.id,
        name: existingUser?.name || legacyAttendant.name,
        email: normalizedEmail,
        role: existingUser?.role || 'attendant',
        permissions: existingUser?.permissions || ['patients', 'appointments'],
        phone: existingUser?.phone || legacyAttendant.phone,
        photoURL: existingUser?.photoURL,
        cpf: existingUser?.cpf,
      };
    }

    const legacyPatient = patients.find((p: any) => p.email?.toLowerCase() === normalizedEmail && p.password === password);
    if (legacyPatient) {
      const existingUser = users.find(u => u.id === legacyPatient.id || u.email.toLowerCase() === normalizedEmail);
      return {
        id: existingUser?.id || legacyPatient.id,
        name: existingUser?.name || legacyPatient.name,
        email: normalizedEmail,
        role: existingUser?.role || 'patient',
        permissions: existingUser?.permissions || ['patient-profile'],
        phone: existingUser?.phone || legacyPatient.phone,
        photoURL: existingUser?.photoURL,
        cpf: existingUser?.cpf || legacyPatient.cpf,
      };
    }

    return null;
  };

  const canFallbackToLegacySession = (error: any) => {
    const code = String(error?.code || '');
    return [
      'auth/operation-not-allowed',
      'auth/invalid-api-key',
      'auth/network-request-failed',
      'auth/internal-error',
      'auth/too-many-requests',
      'auth/configuration-not-found',
      'auth/recaptcha-not-enabled'
    ].includes(code);
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string).trim().toLowerCase();
    const password = formData.get('password') as string;

    try {
      await runWithLoading(async () => {
        let authUid = '';
        let legacySessionUser: (User & { authUid?: string }) | null = null;

        try {
          const credential = await signInWithEmailAndPassword(auth, email, password);
          authUid = credential.user.uid;
        } catch (authErr: any) {
          const legacyUser = resolveLegacyUserByCredentials(email, password);
          if (!legacyUser) {
            throw authErr;
          }
          legacySessionUser = legacyUser;

          // Se Email/Senha estiver desabilitado no Firebase Auth, mantém acesso legado
          // sem persistir flag local; evita chamadas que geram 400 no console.
          let skipAuthMigration = false;
          if (canFallbackToLegacySession(authErr)) {
            console.warn('Firebase Email/Password indisponível, usando fallback legado para', email);
            await setDoc(doc(db, 'users', legacyUser.id), { ...legacyUser }, { merge: true }).catch(() => {});
            skipAuthMigration = true;
          }

          // Migração automática para Firebase Auth quando possível.
          if (!skipAuthMigration && password.length >= 6) {
            try {
              await createAuthUserWithSecondaryApp(email, password);
            } catch (createErr: any) {
              if (createErr?.code !== 'auth/email-already-in-use' && !canFallbackToLegacySession(createErr)) {
                throw createErr;
              }
            }

            try {
              const credential = await signInWithEmailAndPassword(auth, email, password);
              authUid = credential.user.uid;
              await setDoc(doc(db, 'users', legacyUser.id), { ...legacyUser, authUid }, { merge: true });
              await clearLegacyPasswords(legacyUser.id);
            } catch (migrationErr: any) {
              if (!canFallbackToLegacySession(migrationErr) && !canFallbackToLegacySession(authErr)) {
                throw migrationErr;
              }
              await setDoc(doc(db, 'users', legacyUser.id), { ...legacyUser }, { merge: true }).catch(() => {});
            }
          } else {
            await setDoc(doc(db, 'users', legacyUser.id), { ...legacyUser }, { merge: true }).catch(() => {});
          }
        }

        const appUser = authUid
          ? (users.find((u: any) => u.authUid === authUid) || users.find(u => u.email.toLowerCase() === email))
          : legacySessionUser;
        if (!appUser) {
          await signOut(auth).catch(() => {});
          setLoginError('Conta autenticada, mas perfil não encontrado no sistema.');
          return;
        }

        if (!(appUser as any).authUid) {
          await setDoc(doc(db, 'users', appUser.id), { authUid }, { merge: true });
        }

        setUser(appUser);
        setSessionExpired(false);
        sessionStorage.setItem('odonto_user', JSON.stringify(appUser));
        setActiveTab(appUser.role === 'patient' ? 'patient-profile' : appUser.role === 'dentist' ? 'dentist-appointments' : 'dashboard');
        logAction('Login', 'system', appUser.id, `Usuário ${appUser.name} entrou no sistema.`);
      });
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Credenciais incorretas.');
    }
  };

  const handleLogout = async (expired = false) => {
    if (user) logAction('Logout', 'system', user.id, expired ? `${user.name} sessão encerrada por inatividade.` : `${user.name} saiu do sistema.`);
    await signOut(auth).catch(() => {});
    setUser(null);
    sessionStorage.removeItem('odonto_user');
    setActiveTab('dashboard');
    if (expired) setSessionExpired(true);
  };

  // Encerra sessão após 15 minutos de inatividade
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handleLogout(true), INACTIVITY_TIMEOUT);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach(ev => window.addEventListener(ev, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [user]);

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
      await runWithLoading(async () => {
        await setDoc(doc(db, 'patients', id), newPatient);

        // Criar usuário correspondente para o portal do paciente
        const patientPassword = (data as any).password as string | undefined;
        const hasEmail = !!(newPatient.email && newPatient.email.trim());
        let authUid: string | undefined;

        if (hasEmail && patientPassword && patientPassword.length >= 6) {
          authUid = await createAuthUserWithSecondaryApp(newPatient.email.trim().toLowerCase(), patientPassword);
        }

        const newUser: User & { authUid?: string } = {
          id,
          name: newPatient.name,
          email: newPatient.email,
          role: 'patient',
          permissions: ['patient-profile'],
          phone: newPatient.phone,
          ...(authUid ? { authUid } : {})
        };
        await setDoc(doc(db, 'users', id), newUser);
      });

      logAction('Criação', 'patient', newPatient.id, `Paciente ${newPatient.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patients');
    }
  };

  const deletePatient = async (id: string) => {
    try {
      await runWithLoading(async () => {
        const patient = patients.find(p => p.id === id);
        await deleteDoc(doc(db, 'patients', id));
        await deleteDoc(doc(db, 'users', id));

        // Delete related appointments and treatments
        const relatedAppointments = appointments.filter(a => a.patientId === id);
        for (const apt of relatedAppointments) {
          await deleteDoc(doc(db, 'appointments', apt.id));
        }

        const relatedTreatments = treatments.filter(t => t.patientId === id);
        for (const t of relatedTreatments) {
          await deleteDoc(doc(db, 'treatments', t.id));
        }
        logAction('Exclusão', 'patient', id, `Paciente ${patient?.name || id} excluído.`);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${id}`);
    }
  };

  const updatePatient = async (updated: Patient) => {
    try {
      await runWithLoading(async () => {
        const safePatient = stripPassword(updated as any);
        await setDoc(doc(db, 'patients', updated.id), safePatient, { merge: true });
        await setDoc(doc(db, 'patients', updated.id), { password: deleteField() }, { merge: true }).catch(() => {});

        // Em vez de persistir senha em texto, envia link de redefinição.
        if ((updated as any).password && updated.email) {
          await sendPasswordResetEmail(auth, updated.email.toLowerCase()).catch(() => {});
          await setDoc(doc(db, 'users', updated.id), { password: deleteField() }, { merge: true }).catch(() => {});
        }
      });

      logAction('Edição', 'patient', updated.id, `Paciente ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${updated.id}`);
    }
  };

  // Dentist Handlers
  const addDentist = async (data: Omit<Dentist, 'id' | 'createdAt' | 'isActive'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const password = (data as any).password as string | undefined;
    let authUid: string | undefined;

    if (password && password.length >= 6) {
      authUid = await createAuthUserWithSecondaryApp(data.email.trim().toLowerCase(), password);
    }

    const newDentist: Dentist = {
      ...(stripPassword(data as any) as Omit<Dentist, 'id' | 'createdAt' | 'isActive'>),
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
        role: 'dentist',
        permissions: ['patients', 'appointments', 'treatments'],
        phone: newDentist.phone,
        ...(authUid ? { authUid } : {})
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
      const safeUpdated = stripPassword(updated as any);
      await setDoc(doc(db, 'dentists', updated.id), safeUpdated, { merge: true });
      await setDoc(doc(db, 'dentists', updated.id), { password: deleteField() }, { merge: true }).catch(() => {});
      
      // Atualizar usuário correspondente
      const userRef = doc(db, 'users', updated.id);
      await setDoc(userRef, {
        name: updated.name,
        email: updated.email,
        phone: updated.phone
      }, { merge: true });
      await setDoc(userRef, { password: deleteField() }, { merge: true }).catch(() => {});
      if ((updated as any).password && updated.email) {
        await sendPasswordResetEmail(auth, updated.email.toLowerCase()).catch(() => {});
      }
      
      logAction('Edição', 'dentist', updated.id, `Dentista ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `dentists/${updated.id}`);
    }
  };

  // Attendant Handlers
  const addAttendant = async (data: Omit<Attendant, 'id' | 'createdAt' | 'isActive'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const password = (data as any).password as string | undefined;
    let authUid: string | undefined;

    if (password && password.length >= 6) {
      authUid = await createAuthUserWithSecondaryApp(data.email.trim().toLowerCase(), password);
    }

    const newAttendant: Attendant = {
      ...(stripPassword(data as any) as Omit<Attendant, 'id' | 'createdAt' | 'isActive'>),
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
        role: 'attendant',
        permissions: ['patients', 'appointments'],
        phone: newAttendant.phone,
        ...(authUid ? { authUid } : {})
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
      const safeUpdated = stripPassword(updated as any);
      await setDoc(doc(db, 'attendants', updated.id), safeUpdated, { merge: true });
      await setDoc(doc(db, 'attendants', updated.id), { password: deleteField() }, { merge: true }).catch(() => {});
      
      // Atualizar usuário correspondente
      const userRef = doc(db, 'users', updated.id);
      await setDoc(userRef, {
        name: updated.name,
        email: updated.email,
        phone: updated.phone
      }, { merge: true });
      await setDoc(userRef, { password: deleteField() }, { merge: true }).catch(() => {});
      if ((updated as any).password && updated.email) {
        await sendPasswordResetEmail(auth, updated.email.toLowerCase()).catch(() => {});
      }
      
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

  // Shows dentist notifications for new appointments regardless of who created them.
  useEffect(() => {
    if (user?.role !== 'dentist') {
      dentistSeenAppointmentIdsRef.current = new Set();
      dentistNotifInitializedRef.current = false;
      return;
    }

    const myAppointments = appointments.filter(a => a.dentistId === user.id && a.status !== 'cancelled');
    const currentIds = new Set(myAppointments.map(a => a.id));

    if (!dentistNotifInitializedRef.current) {
      dentistSeenAppointmentIdsRef.current = currentIds;
      dentistNotifInitializedRef.current = true;
      return;
    }

    const newAppointments = myAppointments.filter(a => !dentistSeenAppointmentIdsRef.current.has(a.id));
    if (newAppointments.length > 0) {
      const newNotifs = newAppointments.map((apt) => {
        const patientName = patients.find(p => p.id === apt.patientId)?.name || 'Paciente';
        return {
          id: Math.random().toString(36).substr(2, 9),
          message: `Novo agendamento: ${patientName} em ${parseDate(apt.date).toLocaleDateString('pt-BR')} às ${apt.time}`,
          type: 'success' as const,
        };
      });

      setNotifications(prev => [...prev, ...newNotifs]);
      if (activeTab !== 'dentist-appointments') {
        setUnseenCount(prev => prev + newNotifs.length);
      }

      newNotifs.forEach((notif) => {
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notif.id));
        }, 5000);
      });
    }

    dentistSeenAppointmentIdsRef.current = currentIds;
  }, [appointments, patients, user, activeTab]);

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
      logAction(data.status === 'blocked' ? 'Bloqueio de Horário' : 'Criação', 'appointment', newApt.id, `Agendamento para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`);

      // Email notification
      const patient = patients.find(p => p.id === data.patientId);
      const dentist = dentists.find(d => d.id === data.dentistId);
      const dentistName = dentist?.name || '';
      if (patient && data.status !== 'blocked') {
        // Fallback: se dependente não tiver e-mail, usa o e-mail do titular
        let notifyEmail = patient.email && String(patient.email).trim() !== '' ? patient.email : '';
        if (!notifyEmail && patient.dependentOf) {
          const titular = patients.find(p => p.id === patient.dependentOf);
          if (titular?.email && String(titular.email).trim() !== '') notifyEmail = titular.email;
        }

        if (notifyEmail) {
          emailService.sendAppointmentEmail(
            notifyEmail,
            'Confirmação de Agendamento',
            `Olá ${patient.name}, seu agendamento foi confirmado para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.\nDentista: ${dentistName}`
          );
        } else {
          const newNotification = {
            id: Math.random().toString(36).substr(2, 9),
            message: `Paciente ${patient.name} não possui e-mail cadastrado — confirmação não enviada.`,
            type: 'info' as const
          };
          setNotifications(prev => [...prev, newNotification]);
          setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
        }

        // Mostrar confirmação na tela do paciente quando o agendamento for criado por ele
        if (user?.role === 'patient' && user.id === data.patientId) {
          const patientNotif = {
            id: Math.random().toString(36).substr(2, 9),
            message: `Agendamento confirmado para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`,
            type: 'success' as const
          };
          setNotifications(prev => [...prev, patientNotif]);
          setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== patientNotif.id)), 5000);
        }
      }

      // Request server to sync this appointment to connected Google Calendars
      try {
        await fetch('/api/sync-appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment: newApt })
        });
      } catch (syncErr) {
        console.warn('Failed to request calendar sync', syncErr);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    }
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status });
      logAction('Atualização de Status', 'appointment', id, `Status do agendamento alterado para ${status}.`);
      // Trigger calendar sync for this appointment (use local cache to get details)
      try {
        const apt = appointments.find(a => a.id === id);
        if (apt) {
          const syncApt = { ...apt, status };
          await fetch('/api/sync-appointment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment: syncApt }) });
        }
      } catch (syncErr) {
        console.warn('Failed to request calendar sync on status update', syncErr);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${id}`);
    }
  };

  const updateAppointment = async (updatedAppointment: Appointment) => {
    try {
      await setDoc(doc(db, 'appointments', updatedAppointment.id), updatedAppointment, { merge: true });
      logAction('Edição', 'appointment', updatedAppointment.id, `Agendamento para ${parseDate(updatedAppointment.date).toLocaleDateString('pt-BR')} às ${updatedAppointment.time} atualizado.`);
      
      // Email notification
      const patient = patients.find(p => p.id === updatedAppointment.patientId);
      const dentist = dentists.find(d => d.id === updatedAppointment.dentistId);
      const dentistName = dentist?.name || '';
      if (patient) {
        // Fallback: dependente herda e-mail do titular quando necessário
        let notifyEmail = patient.email && String(patient.email).trim() !== '' ? patient.email : '';
        if (!notifyEmail && patient.dependentOf) {
          const titular = patients.find(p => p.id === patient.dependentOf);
          if (titular?.email && String(titular.email).trim() !== '') notifyEmail = titular.email;
        }
        if (notifyEmail) {
          emailService.sendAppointmentEmail(
            notifyEmail,
            'Atualização de Agendamento',
            `Olá ${patient.name}, seu agendamento foi atualizado para ${parseDate(updatedAppointment.date).toLocaleDateString('pt-BR')} às ${updatedAppointment.time}.\nDentista: ${dentistName}`
          );
        }
      }
      // Request server to sync updated appointment
      try {
        await fetch('/api/sync-appointment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment: updatedAppointment }) });
      } catch (syncErr) {
        console.warn('Failed to request calendar sync on update', syncErr);
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

  const formatCPF = (value: string) => {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0,3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
  };

  const handleForgotPasswordCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForgotPasswordCpf(formatCPF(e.target.value));
  };

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
    const email = (forgotPasswordEmail || '').trim().toLowerCase();
    const cpfNormalized = (forgotPasswordCpf || '').replace(/\D/g, '');

    // Primeiro tenta encontrar no collection `users` (caso o cpf tenha sido salvo lá)
    let userToUpdate: any = users.find(u => u.email && u.email.toLowerCase() === email && u.cpf && u.cpf.replace(/\D/g, '') === cpfNormalized);

    // Se não encontrou, tenta pela collection `patients` (pacientes normalmente têm o CPF)
    let patientMatch: any = null;
    if (!userToUpdate) {
      patientMatch = patients.find(p => p.email && p.email.toLowerCase() === email && p.cpf && p.cpf.replace(/\D/g, '') === cpfNormalized);
      if (patientMatch) {
        // Tenta achar o usuário correspondente por id; se não existir criaremos/atualizaremos o doc `users` em seguida
        userToUpdate = users.find(u => u.id === patientMatch.id) || { id: patientMatch.id, email: patientMatch.email, name: patientMatch.name };
      }
    }

    if (userToUpdate) {
      try {
        await sendPasswordResetEmail(auth, String(userToUpdate.email).toLowerCase());
        alert('Enviamos um e-mail do Firebase Authentication para redefinição de senha. Verifique sua caixa de entrada.');
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

  // Reset via link: modal and handler
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetUid, setResetUid] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('resetToken');
      const uid = params.get('uid');
      if (token && uid) {
        setResetToken(token);
        setResetUid(uid);
        setIsResetPasswordOpen(true);
        // limpa os params da URL para não reaparecer o modal
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {}
  }, []);

  const handleCompleteReset = async () => {
    if (resetNewPassword !== resetConfirmPassword) {
      alert('As senhas não conferem.');
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, 'users', resetUid));
      if (!userSnap.exists()) {
        alert('Token inválido ou usuário não encontrado.');
        return;
      }
      const data = userSnap.data() as any;
      if (!data.passwordResetToken || data.passwordResetToken !== resetToken) {
        alert('Token inválido.');
        return;
      }
      if (!data.passwordResetExpires || data.passwordResetExpires < Date.now()) {
        alert('Token expirado.');
        return;
      }

      await setDoc(doc(db, 'users', resetUid), { password: resetNewPassword, passwordResetToken: '', passwordResetExpires: null }, { merge: true });
      await updateDoc(doc(db, 'patients', resetUid), { password: resetNewPassword }).catch(() => {});
      await updateDoc(doc(db, 'dentists', resetUid), { password: resetNewPassword }).catch(() => {});
      await updateDoc(doc(db, 'attendants', resetUid), { password: resetNewPassword }).catch(() => {});

      alert('Senha redefinida com sucesso. Você já pode entrar usando a nova senha.');
      setIsResetPasswordOpen(false);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${resetUid}`);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-800 flex items-center justify-center p-4">
        {globalLoading && <LoadingOverlay />}
        <Card className="w-full max-w-md border-none shadow-2xl">
          <CardHeader className="space-y-4 text-center pb-8">
            <div className="mx-auto h-24 w-24 rounded-2xl flex items-center justify-center">
              <img src="/brasao-BM.png" alt="Logo Bravo Odonto" className="h-20 w-20 object-contain" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight">Diretoria de Saúde</CardTitle>
              <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {sessionExpired && (
                <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200 text-center">
                  Sua sessão foi encerrada por inatividade. Faça login novamente.
                </div>
              )}
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
              
              </form>
          </CardContent>
        </Card>

        <Modal isOpen={isForgotPasswordOpen} onClose={() => setIsForgotPasswordOpen(false)} title="Recuperar Senha" closeOnBackdropClick={false}>
          <div className="space-y-4">
            <Input label="Email" type="email" value={forgotPasswordEmail} onChange={(e) => setForgotPasswordEmail(e.target.value)} />
            <Input label="CPF" type="text" value={forgotPasswordCpf} onChange={handleForgotPasswordCpfChange} />
            <Button onClick={handleForgotPassword} className="w-full">Enviar nova senha</Button>
          </div>
        </Modal>
        <Modal isOpen={isResetPasswordOpen} onClose={() => setIsResetPasswordOpen(false)} title="Redefinir Senha" closeOnBackdropClick={false}>
          <div className="space-y-4">
            <Input label="Nova senha" type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} />
            <Input label="Confirme a nova senha" type="password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} />
            <Button onClick={handleCompleteReset} className="w-full">Redefinir senha</Button>
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
      {globalLoading && <LoadingOverlay />}
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
              onConfirmAppointment={async (id: string) => {
                try {
                  await updateAppointmentStatus(id, 'confirmed');
                  const notif = { id: Math.random().toString(36).substr(2,9), message: 'Agendamento confirmado com sucesso.', type: 'success' as const };
                  setNotifications(prev => [...prev, notif]);
                  setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 5000);
                } catch (err) {
                  const notif = { id: Math.random().toString(36).substr(2,9), message: 'Falha ao confirmar agendamento.', type: 'info' as const };
                  setNotifications(prev => [...prev, notif]);
                  setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 5000);
                  console.error('Confirm appointment error', err);
                }
              }}
              onCancelAppointment={async (id: string) => {
                try {
                  await updateAppointmentStatus(id, 'cancelled');

                  // Envia email automático de cancelamento ao paciente (usa titular caso dependente não tenha e-mail)
                  const apt = appointments.find(a => a.id === id);
                  if (apt) {
                    const patient = patients.find(p => p.id === apt.patientId);
                    const dentist = dentists.find(d => d.id === apt.dentistId);
                    let patientEmail = patient?.email && String(patient.email).trim() !== '' ? patient!.email : undefined;
                    if (!patientEmail && patient?.dependentOf) {
                      const titular = patients.find(p => p.id === patient.dependentOf);
                      if (titular?.email && String(titular.email).trim() !== '') patientEmail = titular.email;
                    }

                    const subject = 'Cancelamento de Agendamento - Bravo Odonto';
                    const dateStr = apt ? parseDate(apt.date).toLocaleDateString('pt-BR') : '';
                    const timeStr = apt ? apt.time : '';
                    const dentistName = dentist?.name || '';
                    const details = `Olá ${patient?.name || 'Paciente'},\n\nInformamos que seu agendamento para ${dateStr} às ${timeStr} com ${dentistName} foi cancelado.\n\nCaso queira reagendar, acesse o portal do paciente ou entre em contato conosco.`;

                    if (patientEmail) {
                      try {
                        emailService.sendAppointmentEmail(patientEmail, subject, details);
                      } catch (e) {
                        console.error('Falha ao enviar e-mail de cancelamento', e);
                      }
                    } else {
                      const noEmailNotif = { id: Math.random().toString(36).substr(2,9), message: `Paciente não possui e-mail cadastrado — notificação de cancelamento não enviada.`, type: 'info' as const };
                      setNotifications(prev => [...prev, noEmailNotif]);
                      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== noEmailNotif.id)), 5000);
                    }
                  }

                  const notif = { id: Math.random().toString(36).substr(2,9), message: 'Agendamento cancelado.', type: 'info' as const };
                  setNotifications(prev => [...prev, notif]);
                  setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 5000);
                } catch (err) {
                  const notif = { id: Math.random().toString(36).substr(2,9), message: 'Falha ao cancelar agendamento.', type: 'info' as const };
                  setNotifications(prev => [...prev, notif]);
                  setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 5000);
                  console.error('Cancel appointment error', err);
                }
              }}
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
                  onTabChange={setActiveTab}
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
                  onTabChange={setActiveTab}
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
