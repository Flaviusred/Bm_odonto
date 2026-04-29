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
import { API_BASE, safeRandomUUID } from './lib/utils';
import { canAccessTab, getDefaultTabForUser, isDentistTab, isPatientTab } from './lib/permissions';
import LoadingOverlay from './components/LoadingOverlay';
import { subscribe as subscribeLoading, runWithLoading } from './lib/loadingStore';
import { collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc, getDoc, query, where, deleteField, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, createAuthUserWithSecondaryApp } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  // Em leituras/listagens, erro de permissão pode ser esperado para alguns perfis.
  // Em escritas, precisamos tratar como erro real para não mascarar falhas de cadastro.
  const isPermissionError = message.includes('Missing or insufficient permissions') ||
    (error as any)?.code === 'permission-denied';
  if (isPermissionError && (operationType === OperationType.LIST || operationType === OperationType.GET)) {
    console.warn(`Firestore [${operationType}] at ${path}: sem permissão (ignorado para este perfil).`);
    return;
  }
  console.error(`Firestore Error [${operationType}] at ${path}:`, message);
}

function normalizeUsersCollection(rows: any[]): User[] {
  const byAuthOrId = new Map<string, any>();
  const score = (u: any) => {
    let s = 0;
    if (u?.authUid) s += 2;
    if (u?.id && u?.authUid && u.id === u.authUid) s += 3;
    if (u?.permissions && Array.isArray(u.permissions) && u.permissions.length > 0) s += 1;
    return s;
  };

  rows.forEach((u: any) => {
    const key = String(u?.authUid || u?.id || '').trim();
    if (!key) return;
    const existing = byAuthOrId.get(key);
    if (!existing || score(u) >= score(existing)) {
      byAuthOrId.set(key, u);
    }
  });

  const byEmail = new Map<string, any>();
  Array.from(byAuthOrId.values()).forEach((u: any) => {
    const emailKey = String(u?.email || '').trim().toLowerCase();
    if (!emailKey) return;
    const existing = byEmail.get(emailKey);
    if (!existing || score(u) >= score(existing)) {
      byEmail.set(emailKey, u);
    }
  });

  const result = Array.from(byAuthOrId.values()).filter((u: any) => {
    const emailKey = String(u?.email || '').trim().toLowerCase();
    if (!emailKey) return true;
    return byEmail.get(emailKey) === u;
  });

  return result as User[];
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
      return getDefaultTabForUser(u);
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

  type NotificationItem = { id: string; message: string; type: 'info' | 'success'; countedForBadge?: boolean; read?: boolean; appointmentId?: string | null; createdAt?: number; showAsToast?: boolean };
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const collectionsInitializedRef = React.useRef<Record<string, boolean>>({});
  const [suppressInitialToasts, setSuppressInitialToasts] = useState(false);
  // cache initial persisted notifications to avoid showing a flood of toasts on login
  const notificationsCacheRef = React.useRef<NotificationItem[]>([]);
  const notificationsInitializedRef = React.useRef(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [reminderSettings, setReminderSettings] = useState({
    emailReminders: true,
    reminderHoursBefore: 24
  });
  const finalizedAppointmentStatuses = new Set<Appointment['status']>(['completed', 'cancelled', 'Concluído', 'Cancelado', 'blocked', 'Bloqueado']);

  // Helper: resolve a recorded authUid for a given app-level user id
  const getAuthUidForUserId = (id: string): string | undefined => {
    const u = users.find(x => x.id === id) as any;
    if (u && u.authUid) return u.authUid;
    const p = patients.find(x => x.id === id) as any;
    if (p && p.authUid) return p.authUid;
    return undefined;
  };

  // Notification helpers: centralize badge counting and auto-dismiss behavior.
  const removeNotification = async (id: string) => {
    // If this notification is persisted in Firestore, mark it as read there; otherwise just remove locally.
    const n = notifications.find(x => x.id === id);
    if (n && typeof n.read === 'boolean') {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch (err) {
        console.warn('Failed to mark notification as read in Firestore', err);
      }
      // local state will be updated by Firestore listener; provide immediate feedback
      setNotifications(prev => prev.filter(x => x.id !== id));
      if (n.countedForBadge) setUnseenCount(prev => Math.max(0, prev - 1));
      return;
    }

    setNotifications(prev => {
      const item = prev.find(n => n.id === id);
      if (!item) return prev;
      if (item.countedForBadge) {
        setUnseenCount(prevCount => Math.max(0, prevCount - 1));
      }
      return prev.filter(n => n.id !== id);
    });
  };

  const addNotification = async (notif: Omit<NotificationItem, 'countedForBadge'>, options: { autoDismiss?: boolean; ms?: number; persist?: boolean } = { autoDismiss: true, ms: 5000, persist: undefined }) => {
    const counted = user?.role === 'dentist';
    const firebaseUid = auth.currentUser?.uid;
    let persist = typeof options.persist === 'boolean' ? options.persist : (user?.role === 'dentist');

    // Only attempt Firestore persistence when there's a signed-in Firebase Auth user.
    if (persist && !firebaseUid) {
      console.warn('Skipping Firestore persist: no Firebase Auth user available.');
      persist = false;
    }

    const id = notif.id || safeRandomUUID().replace(/-/g,"").substring(0,9);

    if (persist && firebaseUid) {
      try {
        const payload: any = {
          userId: firebaseUid,
          message: notif.message,
          type: notif.type,
          appointmentId: (notif as any).appointmentId || null,
          read: false,
          createdAt: notif.createdAt || Date.now()
        };
        await setDoc(doc(db, 'notifications', id), payload);

        // If this is the initial mount for dentist, increment badge but avoid toasts
        if (initialMountRef.current && user?.role === 'dentist') {
          setUnseenCount(prev => prev + 1);
          return;
        }

        // Add immediate local feedback; Firestore listener will keep state in sync.
        setNotifications(prev => [...prev, { id, message: notif.message, type: notif.type, countedForBadge: counted, read: false, appointmentId: (notif as any).appointmentId || null, createdAt: payload.createdAt, showAsToast: true }]);
        if (counted) setUnseenCount(prev => prev + 1);

        if (options.autoDismiss) {
          setTimeout(() => removeNotification(id), options.ms);
        }
        return;
      } catch (err) {
        console.warn('Failed to persist notification to Firestore, falling back to local', err);
      }
    }

    const item: NotificationItem = { id, ...notif, countedForBadge: counted, showAsToast: true };

    // Suppress toast popups during the first app mount (login) for dentists — keep the badge count but avoid flooding the screen with toasts.
    if (initialMountRef.current && user?.role === 'dentist') {
      if (counted) setUnseenCount(prev => prev + 1);
      return;
    }

    setNotifications(prev => [...prev, item]);
    if (counted) setUnseenCount(prev => prev + 1);
    if (options.autoDismiss) {
      setTimeout(() => removeNotification(item.id), options.ms);
    }
  };

  const toggleNotificationsPanel = () => {
    setIsNotificationsOpen(prev => {
      const next = !prev;
      if (next) {
        // Opening: merge cached persisted notifications with current state without showing toasts
        setNotifications(current => {
          const cached = notificationsCacheRef.current.map(n => ({ ...n, showAsToast: false }));
          const combined = [...cached, ...current.map(n => ({ ...n, showAsToast: false }))];
          // dedupe by id
          const map = new Map<string, NotificationItem>();
          combined.forEach(n => map.set(n.id, n));
          const result = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          return result;
        });
        notificationsCacheRef.current = [];
      }
      return next;
    });
  };

  // Firestore Real-time Sync — reactivo ao estado de autenticação do Firebase
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [firebaseAuthUid, setFirebaseAuthUid] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseAuthReady(true);
      setFirebaseAuthUid(u ? u.uid : null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseAuthReady) return;
    if (!firebaseAuthUid) return; // Firebase Auth precisa estar autenticado
    if (!user) return;            // App user precisa estar setado (garante que users/{authUid} já existe no Firestore)

    const isPatient = user.role === 'patient';
    const unsubscribes: (() => void)[] = [];

    const subscribeAll = (name: string, setter: (data: any[]) => void) => {
      const unsub = onSnapshot(collection(db, name), (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));
        if (name === 'users') {
          setter(normalizeUsersCollection(data));
        } else {
          setter(data);
        }
        try { collectionsInitializedRef.current[name] = true; } catch (e) {}
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, name);
      });
      unsubscribes.push(unsub);
    };

    const subscribeFiltered = (name: string, setter: (data: any[]) => void, ...filters: import('firebase/firestore').QueryConstraint[]) => {
      const q = query(collection(db, name), ...filters);
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));
        setter(data);
        try { collectionsInitializedRef.current[name] = true; } catch (e) {}
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, name);
      });
      unsubscribes.push(unsub);
    };

    const subscribeUnion = (
      name: string,
      setter: (data: any[]) => void,
      queriesConfig: Array<{ key: string; filters: import('firebase/firestore').QueryConstraint[] }>
    ) => {
      const bucket = new Map<string, any[]>();
      const flush = () => {
        const merged = new Map<string, any>();
        for (const rows of bucket.values()) {
          rows.forEach((row) => merged.set(row.id, row));
        }
        const data = Array.from(merged.values());
        setter(data);
        try { collectionsInitializedRef.current[name] = true; } catch (e) {}
      };

      queriesConfig.forEach(({ key, filters }) => {
        const q = query(collection(db, name), ...filters);
        const unsub = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));
          bucket.set(key, data);
          flush();
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, name);
        });
        unsubscribes.push(unsub);
      });
    };

    if (isPatient) {
      // Pacientes: consultas pelo authUid e por email para cobrir registros legados.
      const normalizedEmail = (user.email || '').trim().toLowerCase();
      const appointmentQueries: Array<{ key: string; filters: import('firebase/firestore').QueryConstraint[] }> = [
        { key: 'byAuthUid', filters: [where('patientAuthUid', '==', firebaseAuthUid)] },
      ];
      if (normalizedEmail) {
        appointmentQueries.push({ key: 'byEmail', filters: [where('patientEmail', '==', normalizedEmail)] });
      }
      subscribeUnion('appointments', setAppointments, appointmentQueries);
      subscribeUnion('treatments', setTreatments, [
        { key: 'byAuthUid', filters: [where('patientAuthUid', '==', firebaseAuthUid)] },
      ]);
      subscribeUnion('documents', setDocuments, [
        { key: 'byAuthUid', filters: [where('patientAuthUid', '==', firebaseAuthUid)] },
      ]);
      subscribeUnion('patients', setPatients, [
        { key: 'byAuthUid', filters: [where('authUid', '==', firebaseAuthUid)] },
        ...(normalizedEmail ? [{ key: 'byEmail', filters: [where('email', '==', normalizedEmail)] }] : []),
      ]);

      subscribeAll('announcements', setAnnouncements);
      subscribeAll('users', setUsers);
    } else {
      // Staff: acesso completo
      const staffCollections: Array<{ name: string; setter: (data: any[]) => void }> = [
        { name: 'patients', setter: setPatients },
        { name: 'dentists', setter: setDentists },
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
      if (user.role === 'admin' || user.role === 'attendant') {
        staffCollections.splice(2, 0, { name: 'attendants', setter: setAttendants });
      }
      staffCollections.forEach(({ name, setter }) => subscribeAll(name, setter));

      // Settings só para staff
      const unsubSettings = onSnapshot(doc(db, 'settings', 'reminders'), (snap) => {
        if (snap.exists()) setReminderSettings(snap.data() as any);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/reminders');
      });
      unsubscribes.push(unsubSettings);
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [db, firebaseAuthReady, firebaseAuthUid, user?.id, user?.email]);

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

  const stripUndefinedDeep = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map(stripUndefinedDeep);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, stripUndefinedDeep(v)])
      );
    }
    return value;
  };

  const clearLegacyPasswords = async (id: string) => {
    // updateDoc evita criar documentos vazios quando o doc não existe.
    await updateDoc(doc(db, 'users', id), { password: deleteField() }).catch(() => {});
    await updateDoc(doc(db, 'patients', id), { password: deleteField() }).catch(() => {});
    await updateDoc(doc(db, 'dentists', id), { password: deleteField() }).catch(() => {});
    await updateDoc(doc(db, 'attendants', id), { password: deleteField() }).catch(() => {});
  };

  // Persistence
  useEffect(() => {
    if (user) sessionStorage.setItem('odonto_user', JSON.stringify(user));
    else sessionStorage.removeItem('odonto_user');
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (canAccessTab(user, activeTab)) return;
    const fallbackTab = getDefaultTabForUser(user);
    if (fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [activeTab, user]);

  const createAuthUserFromAdmin = async (email: string, password: string) => {
    try {
      if ((import.meta as any).env?.DEV) {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      }

      const currentAuthUser = auth.currentUser;
      if (!currentAuthUser) {
        throw new Error('Sessao expirada. Faca login novamente para criar usuarios.');
      }

      const idToken = await currentAuthUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/admin/auth/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return String(payload.uid || '').trim();
      }

      // Conta ja existe no Firebase Auth: reaproveita UID para criar docs no Firestore.
      if (response.status === 409 && payload?.uid) {
        return String(payload.uid).trim();
      }

      // Em dev/local, o Admin SDK pode não ter credencial para Auth.
      // Nesses casos, sinaliza indisponibilidade para usar fallback legado no Firestore.
      if (response.status === 404 || response.status >= 500) {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      }

      if (response.status === 503 && String(payload?.error || '').includes('AUTH_BACKEND_UNAVAILABLE')) {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      }

      throw new Error(payload.error || 'Falha ao criar usuario no Firebase Auth.');
    } catch (err: any) {
      // Falhas de rede/local API indisponível: usa fallback legado no Firestore.
      const msg = String(err?.message || '');
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      }
      if (String(err?.code || '') === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
        throw new Error('Este e-mail ja possui conta no Firebase Auth. Use outro e-mail ou recupere a senha da conta existente.');
      }
      throw err;
    }
  };

  const ensureCurrentAdminRoleDoc = async () => {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('Sessao sem autenticacao Firebase. Faca logout e login novamente para criar usuarios.');
    }

    const canonicalRef = doc(db, 'users', current.uid);
    const canonicalSnap = await getDoc(canonicalRef).catch(() => null as any);
    const canonicalData = canonicalSnap && canonicalSnap.exists() ? (canonicalSnap.data() as any) : null;
    const currentRole = String(canonicalData?.role || user?.role || '').trim();

    if (currentRole && (currentRole === 'admin' || currentRole === 'attendant')) {
      return;
    }

    const fallbackRole = (user?.role === 'admin' || user?.role === 'attendant') ? user.role : 'admin';
    await setDoc(canonicalRef, {
      authUid: current.uid,
      email: (current.email || user?.email || '').toLowerCase(),
      name: user?.name || current.displayName || 'Administrador',
      role: fallbackRole,
      permissions: user?.permissions || [],
    }, { merge: true });
  };

  const createManagedUserFromServer = async (payload: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: UserRole;
    permissions: string[];
  }) => {
    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser) {
      throw new Error('Sessao sem autenticacao Firebase. Faca logout e login novamente para criar usuarios.');
    }

    const idToken = await currentAuthUser.getIdToken();
    const response = await fetch(`${API_BASE}/api/admin/users/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = String(data.details || '').trim();
      throw new Error(details ? `${data.error || 'Falha ao criar usuário no servidor.'} (${details})` : (data.error || 'Falha ao criar usuário no servidor.'));
    }

    return data;
  };

  const shouldUseClientUserFallback = (error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error || '');
    const message = raw.toLowerCase();
    return (
      message.includes('auth_backend_unavailable') ||
      message.includes('could not load the default credentials') ||
      message.includes('default credentials')
    );
  };

  const createManagedUserLocally = async (payload: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: UserRole;
    permissions: string[];
  }) => {
    let authUid = '';
    let legacyAuth = false;

    try {
      authUid = await createAuthUserWithSecondaryApp(payload.email, payload.password);
    } catch (err: any) {
      // Qualquer falha no Firebase Auth client-side (reCAPTCHA, credenciais, email existente, etc.)
      // resulta em modo legado: usuário criado apenas no Firestore, sem conta Auth.
      console.warn('createAuthUserWithSecondaryApp falhou, usando modo legado:', err?.code || err?.message);
      legacyAuth = true;
    }

    const generatedId = authUid || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userDoc: any = stripUndefinedDeep({
      id: generatedId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone || '',
      role: payload.role,
      permissions: payload.permissions || [],
      createdAt: new Date().toISOString(),
      isActive: true,
      authUid: authUid || undefined,
      legacyAuth: !authUid || undefined,
      password: !authUid ? payload.password : undefined,
    });

    await runWithLoading(async () => {
      await setDoc(doc(db, 'users', generatedId), userDoc, { merge: true });

      if (payload.role === 'attendant') {
        await setDoc(doc(db, 'attendants', generatedId), stripUndefinedDeep({
          id: generatedId,
          name: payload.name,
          email: payload.email,
          phone: payload.phone || '',
          createdAt: new Date().toISOString(),
          isActive: true,
          authUid: authUid || undefined,
          legacyAuth: legacyAuth || undefined,
          password: !authUid ? payload.password : undefined,
        }), { merge: true });
      }

      if (payload.role === 'dentist') {
        await setDoc(doc(db, 'dentists', generatedId), stripUndefinedDeep({
          id: generatedId,
          name: payload.name,
          email: payload.email,
          phone: payload.phone || '',
          createdAt: new Date().toISOString(),
          isActive: true,
          authUid: authUid || undefined,
          legacyAuth: legacyAuth || undefined,
          password: !authUid ? payload.password : undefined,
        }), { merge: true });
      }
    });

    return {
      user: {
        id: generatedId,
      },
    };
  };

  const addUser = async (data: Omit<User, 'id'>) => {
    const email = data.email.trim().toLowerCase();
    const password = (data as any).password as string | undefined;

    if (!auth.currentUser) {
      throw new Error('Sessao sem autenticacao Firebase. Faca logout e login novamente para criar usuarios.');
    }

    const existingUserByEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === email);
    if (existingUserByEmail) {
      throw new Error(
        `Ja existe um usuario com este e-mail (${existingUserByEmail.name} - ${existingUserByEmail.role}). ` +
        'Altere o e-mail ou edite o usuario existente.'
      );
    }

    if (!password || password.length < 6) {
      throw new Error('Senha deve ter pelo menos 6 caracteres para criar conta no Firebase Auth.');
    }

    await ensureCurrentAdminRoleDoc();

    const payload = {
      name: data.name,
      email,
      phone: data.phone,
      password,
      role: data.role,
      permissions: (data as any).permissions || [],
    };

    let serverPayload: any;
    try {
      serverPayload = await createManagedUserFromServer(payload);
    } catch (error) {
      if (!shouldUseClientUserFallback(error)) {
        throw error;
      }
      serverPayload = await createManagedUserLocally(payload);
    }

    const newUser: User = {
      ...(stripPassword(data as any) as Omit<User, 'id'>),
      id: String(serverPayload?.user?.id || ''),
      email,
      role: data.role,
      permissions: (data as any).permissions || [],
      phone: data.phone || '',
    };
    if (!newUser.id) {
      throw new Error('Servidor nao retornou id do usuario criado.');
    }
    
    try {
      await runWithLoading(async () => Promise.resolve());

      setUsers((prev) => normalizeUsersCollection([...(prev as any[]), newUser as any]));
      if (newUser.role === 'attendant') {
        const attendantLocal: Attendant = {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone || '',
          createdAt: new Date().toISOString(),
          isActive: true,
        };
        setAttendants((prev) => {
          if (prev.some((a) => a.id === attendantLocal.id)) return prev;
          return [...prev, attendantLocal];
        });
      }

      logAction('Criação', 'system', newUser.id, `Usuário ${newUser.name} criado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Falha ao criar usuário no Firestore.');
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

  const syncAuthPassword = async (userId: string, newPassword: string, email?: string, previousEmail?: string) => {
    const trimmedPassword = String(newPassword || '').trim();
    if (!trimmedPassword) return;

    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser) {
      throw new Error('Sessão expirada. Faça login novamente para atualizar a senha.');
    }

    const idToken = await currentAuthUser.getIdToken();
    const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        newPassword: trimmedPassword,
        email: email || '',
        previousEmail: previousEmail || '',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao atualizar senha no Firebase Auth.');
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
        if ((updated as any).password) {
          const existingUser = users.find((u) => u.id === updated.id);
          await syncAuthPassword(updated.id, String((updated as any).password), updated.email, existingUser?.email);
        }

        const userRef = doc(db, 'users', updated.id);
        const safeUpdated = stripPassword(updated as any);
        await setDoc(userRef, safeUpdated, { merge: true });
        await setDoc(userRef, { password: deleteField() }, { merge: true });
        console.log('Usuário atualizado no Firestore com sucesso');

        // If user is a dentist, update the dentist record too
        if (updated.role === 'dentist') {
          const dentistRef = doc(db, 'dentists', updated.id);
          await setDoc(dentistRef, {
            name: updated.name,
            email: updated.email,
            phone: updated.phone || '',
            cro: (updated as any).cro || '',
            specialty: (updated as any).specialty || ''
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
      if (user?.id === id) {
        setUser({ ...user, role, permissions });
      }
      logAction('Edição', 'system', id, `Permissões do usuário atualizadas.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${id}`);
    }
  };

  const logAction = async (action: string, entityType: AuditLog['entityType'], entityId?: string, details?: string) => {
    if (!user) return;
    const id = safeRandomUUID().replace(/-/g,"").substring(0,9);
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
      // Erro de permissão é esperado para usuários sem acesso a audit_logs (ex: pacientes)
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('Missing or insufficient permissions') && (error as any)?.code !== 'permission-denied') {
        console.error("Failed to log action to Firestore", error);
      }
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
          if (legacyUser.role === 'admin' || legacyUser.role === 'attendant') {
            throw new Error('Login administrativo requer autenticacao Firebase. Verifique Email/Senha no Firebase Auth.');
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

        let appUser: any = legacySessionUser;
        if (authUid) {
          // Tenta pelo doc users/{authUid} direto (caso normal e pós-migração)
          const directSnap = await getDoc(doc(db, 'users', authUid));
          if (directSnap.exists()) {
            appUser = { ...directSnap.data(), id: directSnap.id };
            // Enriquecimento do usuário canônico: se já existia users/{authUid},
            // ainda pode faltar o vínculo com o ID legado usado nos agendamentos antigos.
            try {
              const byEmailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
              const legacyDoc = byEmailSnap.docs.find((item) => item.id !== authUid);
              if (legacyDoc) {
                const legacyData: any = legacyDoc.data();
                appUser = {
                  ...legacyData,
                  ...appUser,
                  id: authUid,
                  authUid,
                  legacyId: (appUser as any).legacyId || legacyDoc.id,
                };
                await setDoc(doc(db, 'users', authUid), {
                  legacyId: legacyDoc.id,
                  authUid,
                  role: appUser.role,
                  name: appUser.name,
                  email: appUser.email,
                  phone: appUser.phone || legacyData.phone || '',
                  permissions: appUser.permissions || legacyData.permissions || [],
                }, { merge: true });
              }
            } catch (_) {
              // Se a consulta por email falhar, mantém o usuário canônico atual.
            }
          } else if (legacySessionUser) {
            // Usuário legado: o documento existe com ID diferente do authUid.
            // Usa o legacySessionUser já resolvido (que veio de patients/dentists/attendants).
            appUser = legacySessionUser;
          } else {
            // Fallback por email — só tenta se as queries forem permitidas pelas regras
            try {
              const byEmailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
              if (!byEmailSnap.empty) {
                appUser = { ...byEmailSnap.docs[0].data(), id: byEmailSnap.docs[0].id };
              }
            } catch (_) { /* permissão negada: appUser permanece null */ }
          }
        }
        if (!appUser) {
          await signOut(auth).catch(() => {});
          setLoginError('Conta autenticada, mas perfil não encontrado no sistema.');
          return;
        }

        // Garante que users/{authUid} existe — as regras Firestore usam get(users/{authUid})
        // para verificar o papel do usuário (isStaff/isAdmin). Se o documento está em um
        // ID legado diferente do authUid, todas as coleções ficam bloqueadas.
        if (authUid && appUser.id !== authUid) {
          const legacyId = appUser.id;
          const canonicalData = { ...appUser, authUid, legacyId, id: authUid };
          delete canonicalData.password;
          await setDoc(doc(db, 'users', authUid), canonicalData, { merge: true });
          // Mantém authUid no doc legado para retrocompatibilidade
          await setDoc(doc(db, 'users', appUser.id), { authUid }, { merge: true }).catch(() => {});
          appUser = { ...canonicalData };
        } else if (authUid && !(appUser as any).authUid) {
          await setDoc(doc(db, 'users', authUid), { authUid }, { merge: true });
        }

        setUser(appUser);
        setSessionExpired(false);
        sessionStorage.setItem('odonto_user', JSON.stringify(appUser));
        setActiveTab(getDefaultTabForUser(appUser));
        logAction('Login', 'system', appUser.id, `Usuário ${appUser.name} entrou no sistema.`);
      });
    } catch (error) {
      console.error('Login error:', error);
      const message = error instanceof Error ? error.message : '';
      setLoginError(message || 'Credenciais incorretas.');
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
    
    const baseId = data.id || safeRandomUUID().replace(/-/g,"").substring(0,9);
    let createdPatientId = baseId;
    let createdPatientName = data.name;

    try {
      await runWithLoading(async () => {
        // If provided, create an auth user first so we can store authUid on the patient record.
        const patientPassword = (data as any).password as string | undefined;
        const normalizedPatientEmail = String(data.email || '').trim().toLowerCase();
        const hasEmail = normalizedPatientEmail.length > 0;
        let authUid: string | undefined;

        if (hasEmail && patientPassword && patientPassword.length >= 6) {
          authUid = await createAuthUserWithSecondaryApp(normalizedPatientEmail, patientPassword);
        }

        const effectiveId = (!data.id && authUid && !data.dependentOf) ? authUid : baseId;
        const newPatient: Patient = {
          ...data,
          id: effectiveId,
          createdAt: new Date().toISOString(),
          isActive: true
        };
        createdPatientId = effectiveId;
        createdPatientName = newPatient.name;

        // include authUid on patient document when available
        const patientWithAuth: any = stripUndefinedDeep({ ...newPatient, ...(authUid ? { authUid } : {}) });
        await setDoc(doc(db, 'patients', effectiveId), patientWithAuth);

        // Only create a corresponding `users` document for titulars (not for dependents)
        // This keeps the `users` collection contendo apenas os titulares.
        if (!newPatient.dependentOf) {
          const newUser: User & { authUid?: string } = {
            id: effectiveId,
            name: newPatient.name,
            email: newPatient.email,
            role: 'patient',
            permissions: ['patient-profile'],
            phone: newPatient.phone,
            ...(authUid ? { authUid } : {})
          };
          await setDoc(doc(db, 'users', effectiveId), newUser);
        }
      });

      logAction('Criação', 'patient', createdPatientId, `Paciente ${createdPatientName} criado.`);
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
        const safePatient = stripUndefinedDeep(stripPassword(updated as any));
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
    const baseId = safeRandomUUID().replace(/-/g,"").substring(0,9);
    const password = (data as any).password as string | undefined;
    let authUid: string | undefined;

    if (password && password.length >= 6) {
      authUid = await createAuthUserWithSecondaryApp(data.email.trim().toLowerCase(), password);
    }
    const id = authUid || baseId;

    const newDentist: Dentist = {
      ...(stripPassword(data as any) as Omit<Dentist, 'id' | 'createdAt' | 'isActive'>),
      id,
      createdAt: new Date().toISOString(),
      isActive: true,
      ...(authUid ? { authUid } : {})
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
      if ((updated as any).password) {
        const existingDentist = dentists.find((d) => d.id === updated.id);
        await syncAuthPassword(updated.id, String((updated as any).password), updated.email, existingDentist?.email);
      }

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
      
      logAction('Edição', 'dentist', updated.id, `Dentista ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `dentists/${updated.id}`);
    }
  };

  // Attendant Handlers
  const addAttendant = async (data: Omit<Attendant, 'id' | 'createdAt' | 'isActive'>) => {
    const baseId = safeRandomUUID().replace(/-/g,"").substring(0,9);
    const password = (data as any).password as string | undefined;
    let authUid: string | undefined;

    if (password && password.length >= 6) {
      authUid = await createAuthUserWithSecondaryApp(data.email.trim().toLowerCase(), password);
    }
    const id = authUid || baseId;

    const newAttendant: Attendant = {
      ...(stripPassword(data as any) as Omit<Attendant, 'id' | 'createdAt' | 'isActive'>),
      id,
      createdAt: new Date().toISOString(),
      isActive: true,
      ...(authUid ? { authUid } : {})
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
      if ((updated as any).password) {
        const existingAttendant = attendants.find((a) => a.id === updated.id);
        await syncAuthPassword(updated.id, String((updated as any).password), updated.email, existingAttendant?.email);
      }

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
      
      logAction('Edição', 'attendant', updated.id, `Atendente ${updated.name} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendants/${updated.id}`);
    }
  };

  // Appointment Handlers
  const initialMountRef = React.useRef(true);
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (user?.role === 'dentist' && activeTab === 'dentist-appointments') {
      setUnseenCount(0);
    }
  }, [activeTab, user]);

  // Limpa notificações persistidas de atraso quando o agendamento é concluído, cancelado ou removido.
  useEffect(() => {
    if (user?.role !== 'dentist') return;

    notifications
      .filter(notification => notification.appointmentId && notification.message.startsWith('Agendamento pendente:'))
      .forEach((notification) => {
        const appointment = appointments.find(item => item.id === notification.appointmentId);
        if (!appointment || finalizedAppointmentStatuses.has(appointment.status)) {
          void removeNotification(notification.id);
        }
      });
  }, [appointments, notifications, user]);

  // Firestore-backed notifications subscription for current user
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnseenCount(0);
      return;
    }

    // Wait for Firebase Auth to finish initializing before subscribing.
    // Without this guard, on page refresh `user` is restored from sessionStorage
    // while `auth.currentUser` is still null, causing the subscription to be skipped permanently.
    if (!firebaseAuthReady) return;

    // Only subscribe when there's an authenticated Firebase user — otherwise the onSnapshot will fail with permission errors.
    const firebaseUid = auth.currentUser?.uid;
    if (!firebaseUid) {
      console.warn('Skipping notifications subscription: no Firebase Auth user.');
      setNotifications([]);
      setUnseenCount(0);
      setSuppressInitialToasts(false);
      return;
    }
    // Reset initialization marker so per-user initial snapshot is cached.
    notificationsInitializedRef.current = false;

    try {
      // start by suppressing initial toasts for dentists to avoid flood on login
      if (user.role === 'dentist') setSuppressInitialToasts(true);

      const q = query(collection(db, 'notifications'), where('userId', '==', firebaseUid), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(d => {
          const data: any = d.data();
          return {
            id: d.id,
            message: data.message,
            type: data.type,
            read: !!data.read,
            appointmentId: data.appointmentId || null,
            countedForBadge: !data.read,
            createdAt: data.createdAt || 0
          } as NotificationItem;
        });

        // First snapshot: cache persisted notifications and avoid showing toasts immediately.
        if (!notificationsInitializedRef.current) {
          notificationsInitializedRef.current = true;
          notificationsCacheRef.current = docs.map(d => ({ ...d, showAsToast: false }));
          setUnseenCount(docs.filter(x => !x.read).length);
          if (user.role === 'dentist') setSuppressInitialToasts(true);
          if (user.role === 'dentist') {
            setTimeout(() => setSuppressInitialToasts(false), 800);
          } else {
            setSuppressInitialToasts(false);
          }
          return;
        }

        // Subsequent snapshots: apply only incremental changes to avoid re-triggering toasts for cached items.
        snapshot.docChanges().forEach(change => {
          const d = change.doc;
          const data: any = d.data();
          const item: NotificationItem = {
            id: d.id,
            message: data.message,
            type: data.type,
            read: !!data.read,
            appointmentId: data.appointmentId || null,
            countedForBadge: !data.read,
            createdAt: data.createdAt || 0,
            showAsToast: true
          };

          if (change.type === 'added') {
            setNotifications(prev => {
              if (prev.some(n => n.id === item.id)) return prev;
              return [...prev, { ...item, showAsToast: true }];
            });
            if (!item.read) setUnseenCount(prev => prev + 1);
          } else if (change.type === 'modified') {
            setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, ...item, showAsToast: false } : n));
          } else if (change.type === 'removed') {
            setNotifications(prev => prev.filter(n => n.id !== item.id));
          }
        });
      }, (err) => {
        console.warn('notifications snapshot error', err);
      });

      return () => {
        unsub();
        setSuppressInitialToasts(false);
      };
    } catch (e) {
      console.warn('Failed to subscribe to notifications', e);
    }
  }, [user, firebaseAuthReady]);

  const markAllNotificationsRead = async () => {
    if (!user) return;
    const firebaseUid = auth.currentUser?.uid;
    if (!firebaseUid) {
      // If not authenticated with Firebase Auth, mark local state as read and clear unseen count.
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnseenCount(0);
      return;
    }

    try {
      const q = query(collection(db, 'notifications'), where('userId', '==', firebaseUid), where('read', '==', false));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true })));
      setUnseenCount(0);
    } catch (err) {
      console.warn('Failed to mark all notifications read', err);
    }
  };

  const addAppointment = async (data: Omit<Appointment, 'id' | 'createdAt'>) => {
    // Conflict detection
    const conflict = appointments.find(a => 
      a.dentistId === data.dentistId && 
      a.date === data.date && 
      a.time === data.time &&
      a.status !== 'cancelled' &&
      a.status !== 'Cancelado'
    );

    if (conflict) {
      const newNotification = {
        id: safeRandomUUID().replace(/-/g,"").substring(0,9),
        message: `Conflito de horário: Este dentista já possui um agendamento para este horário.`,
        type: 'info' as const
      };
      addNotification(newNotification);
      return;
    }

    const id = safeRandomUUID().replace(/-/g,"").substring(0,9);
    const patientAuthUid = getAuthUidForUserId(data.patientId) || null;
    const dentistAuthUid = getAuthUidForUserId(data.dentistId)
      || (user?.role === 'dentist' && user.id === data.dentistId ? auth.currentUser?.uid ?? null : null);
    const patient = patients.find(p => p.id === data.patientId);
    const patientName = patient?.name || 'Paciente';

    const newApt: Appointment = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      patientAuthUid,
      dentistAuthUid
    };
    
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'appointments', id), newApt);

      if (data.status !== 'blocked' && data.status !== 'Bloqueado' && dentistAuthUid) {
        const notificationId = safeRandomUUID().replace(/-/g,"").substring(0,9);
        batch.set(doc(db, 'notifications', notificationId), {
          userId: dentistAuthUid,
          message: `Novo agendamento: ${patientName} às ${data.time}`,
          type: 'success',
          appointmentId: id,
          createdAt: Date.now(),
          read: false,
        });
      }

      await batch.commit();
      logAction(data.status === 'blocked' ? 'Bloqueio de Horário' : 'Criação', 'appointment', newApt.id, `Agendamento para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`);

      // Email notification
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
          try {
            emailService.sendAppointmentEmail(
              notifyEmail,
              'Novo Agendamento',
              `Olá ${patient.name}, seu agendamento foi marcado para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.\nDentista: ${dentistName}`
            );
          } catch (e) {
            console.error('Falha ao enviar e-mail de agendamento', e);
          }
        } else {
          const noEmailNotif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: `Paciente não possui e-mail cadastrado — notificação por e-mail não enviada.`, type: 'info' as const };
          addNotification(noEmailNotif);
        }

        const notif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: 'Agendamento criado.', type: 'success' as const };
        addNotification(notif);
        // Mostrar confirmação na tela do paciente quando o agendamento for criado por ele
        if (user?.role === 'patient' && user.id === data.patientId) {
          const patientNotif = {
            id: safeRandomUUID().replace(/-/g,"").substring(0,9),
            message: `Agendamento confirmado para ${parseDate(data.date).toLocaleDateString('pt-BR')} às ${data.time}.`,
            type: 'success' as const
          };
          addNotification(patientNotif);
        }
      }

      // Request server to sync this appointment to connected Google Calendars
      try {
        await fetch(`${API_BASE}/api/sync-appointment`, {
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
          await fetch(`${API_BASE}/api/sync-appointment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment: syncApt }) });
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
      const patientAuthUid = updatedAppointment.patientAuthUid || getAuthUidForUserId(updatedAppointment.patientId) || null;
      const dentistAuthUid = updatedAppointment.dentistAuthUid || getAuthUidForUserId(updatedAppointment.dentistId) || null;
      await setDoc(doc(db, 'appointments', updatedAppointment.id), { ...updatedAppointment, patientAuthUid, dentistAuthUid }, { merge: true });
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
        await fetch(`${API_BASE}/api/sync-appointment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment: updatedAppointment }) });
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
    const id = safeRandomUUID().replace(/-/g,"").substring(0,9);
    const patientAuthUid = getAuthUidForUserId(data.patientId) || null;
    const newTreatment: Treatment = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      patientAuthUid
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
      const patientAuthUid = updatedTreatment.patientAuthUid || getAuthUidForUserId(updatedTreatment.patientId) || null;
      await setDoc(doc(db, 'treatments', updatedTreatment.id), { ...updatedTreatment, patientAuthUid }, { merge: true });
      logAction('Edição', 'treatment', updatedTreatment.id, `Tratamento ${updatedTreatment.description} atualizado.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `treatments/${updatedTreatment.id}`);
    }
  };

  const addDocument = async (data: Omit<PatientDocument, 'id' | 'uploadedAt'>) => {
    const id = safeRandomUUID().replace(/-/g,"").substring(0,9);
    const patientAuthUid = getAuthUidForUserId(data.patientId) || null;
    const newDoc: PatientDocument = {
      ...data,
      id,
      uploadedAt: new Date().toISOString(),
      patientAuthUid
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
    const cpf = (forgotPasswordCpf || '').replace(/\D/g, '');

    if (!email || !cpf) {
      alert('Preencha o e-mail e o CPF para recuperar a senha.');
      return;
    }

    try {
      await runWithLoading(async () => {
        const currentAppUrl = `${window.location.origin}${window.location.pathname}`;
        const response = await fetch(`${API_BASE}/api/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, cpf, origin: window.location.origin, resetLink: currentAppUrl }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Falha ao iniciar a recuperação de senha.');
        }
      });

      alert('Se o e-mail e CPF corresponderem a uma conta, você receberá um link de recuperação de senha em instantes. Verifique sua caixa de entrada e a pasta de spam.');
      setIsForgotPasswordOpen(false);
      setForgotPasswordEmail('');
      setForgotPasswordCpf('');
    } catch (error: any) {
      console.error('handleForgotPassword error:', error);
      alert(error?.message || 'Ocorreu um erro. Tente novamente.');
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
      await runWithLoading(async () => {
        const response = await fetch(`${API_BASE}/api/reset-password/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: resetUid, token: resetToken, newPassword: resetNewPassword }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Falha ao redefinir a senha.');
        }
      });

      alert('Senha redefinida com sucesso. Você já pode entrar usando a nova senha.');
      setIsResetPasswordOpen(false);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Falha ao redefinir a senha.');
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
                    autoComplete="username"
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
                    autoComplete="current-password"
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
            <Input label="Nova senha" type="password" autoComplete="new-password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} />
            <Input label="Confirme a nova senha" type="password" autoComplete="new-password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} />
            <Button onClick={handleCompleteReset} className="w-full">Redefinir senha</Button>
          </div>
        </Modal>
      </div>
    );
  }

  const isPatient = user.role === 'patient';
  const isDentist = user.role === 'dentist';
  const shouldRenderPatientPortal = isPatient && isPatientTab(activeTab);
  const shouldRenderDentistPortal = isDentist && isDentistTab(activeTab);
  const normalizedUserEmail = String(user.email || '').trim().toLowerCase();
  const patientData = isPatient
    ? (
      patients.find((p: any) =>
        p.id === user.id
        || ((p as any).authUid && firebaseAuthUid && (p as any).authUid === firebaseAuthUid)
        || ((p as any).email && normalizedUserEmail !== '' && String((p as any).email || '').trim().toLowerCase() === normalizedUserEmail)
      )
      || {
        id: user.id,
        name: user.name || 'Paciente',
        email: user.email || '',
        phone: (user as any).phone || '',
        cpf: (user as any).cpf || '',
        birthDate: '1970-01-01',
        address: (user as any).address || '',
        createdAt: (user as any).createdAt || new Date().toISOString(),
        isActive: true,
        patientType: 'civil' as const,
        authUid: firebaseAuthUid || user.id,
      }
    )
    : null;
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
        {!suppressInitialToasts && notifications.filter(n => n.showAsToast).map(n => (
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
              onClick={() => removeNotification(n.id)}
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
          {shouldRenderPatientPortal && patientData ? (
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
                  const notif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: 'Agendamento confirmado com sucesso.', type: 'success' as const };
                  addNotification(notif);
                } catch (err) {
                  const notif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: 'Falha ao confirmar agendamento.', type: 'info' as const };
                  addNotification(notif);
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
                      const noEmailNotif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: `Paciente não possui e-mail cadastrado — notificação de cancelamento não enviada.`, type: 'info' as const };
                      addNotification(noEmailNotif);
                    }
                  }

                  const notif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: 'Agendamento cancelado.', type: 'info' as const };
                  addNotification(notif);
                } catch (err) {
                  const notif = { id: safeRandomUUID().replace(/-/g,"").substring(0,9), message: 'Falha ao cancelar agendamento.', type: 'info' as const };
                  addNotification(notif);
                  console.error('Cancel appointment error', err);
                }
              }}
            />
          ) : shouldRenderDentistPortal ? (
            <DentistPortal 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              dentist={(() => {
                const normalizedUserEmail = String(user.email || '').trim().toLowerCase();
                const found = dentists.find((d: any) =>
                  d.id === user.id
                  || (((d as any).authUid && (d as any).authUid === user.id))
                  || (normalizedUserEmail !== '' && String((d as any).email || '').trim().toLowerCase() === normalizedUserEmail)
                ) as any;
                if (found) {
                  return {
                    ...found,
                    authUid: (found as any).authUid || user.id,
                    legacyId: (user as any).legacyId || ((found as any).id !== user.id ? (found as any).id : (found as any).legacyId),
                  } as any;
                }
                return (dentists[0] as any) || ({
                  id: user.id,
                  name: user.name || 'Dentista',
                  email: user.email || '',
                  phone: user.phone || '',
                  specialty: 'Geral',
                  cro: '',
                  createdAt: new Date().toISOString(),
                  isActive: true,
                  authUid: user.id,
                  legacyId: (user as any).legacyId,
                } as any);
              })()}
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
              schedules={schedules}
              unseenCount={unseenCount}
              setUnseenCount={setUnseenCount}
              markAllNotificationsRead={markAllNotificationsRead}
              notifications={notifications}
              isNotificationsOpen={isNotificationsOpen}
              toggleNotificationsPanel={toggleNotificationsPanel}
              removeNotification={removeNotification}
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
