import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type AppointmentStatus = 'Agendado' | 'Confirmado' | 'Cancelado' | 'Concluído' | 'Bloqueado' | 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'blocked';

type NotificationType = 'success' | 'info' | 'error' | 'warning';

interface AppointmentRecord {
  dentistId?: string;
  dentistAuthUid?: string | null;
  patientId?: string;
  date?: string;
  time?: string;
  status?: AppointmentStatus | string;
}

interface PatientRecord {
  name?: string;
}

interface NotificationRecord {
  appointmentId?: string | null;
}

const FINALIZED_STATUSES = new Set<AppointmentStatus | string>([
  'completed',
  'Concluído',
  'cancelled',
  'Cancelado',
  'blocked',
  'Bloqueado',
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const firebaseConfigPath = path.resolve(__dirname, '../firebase-applet-config.json');
const firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, 'utf8')) as { projectId: string; firestoreDatabaseId?: string };

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT não definido. Configure o secret no GitHub Actions.');
}

const serviceAccount = JSON.parse(serviceAccountJson);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(undefined, firebaseConfig.firestoreDatabaseId || '(default)');

function parseAppointmentDateTime(date: string, time: string): Date {
  let day: number;
  let month: number;
  let year: number;

  if (date.includes('/')) {
    const [dayPart, monthPart, yearPart] = date.split('/');
    day = Number(dayPart);
    month = Number(monthPart) - 1;
    year = Number(yearPart);
  } else {
    const [yearPart, monthPart, dayPart] = date.split('-');
    year = Number(yearPart);
    month = Number(monthPart) - 1;
    day = Number(dayPart);
  }

  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month, day, hours, minutes, 0, 0);
}

function buildNotificationPayload(userId: string, appointmentId: string, patientName: string, time: string): { userId: string; message: string; type: NotificationType; appointmentId: string; createdAt: number; read: boolean } {
  return {
    userId,
    message: `Agendamento pendente: ${patientName} às ${time}`,
    type: 'info',
    appointmentId,
    createdAt: Date.now(),
    read: false,
  };
}

async function run(): Promise<void> {
  const now = new Date();
  const appointmentsSnap = await db.collection('appointments').get();

  const overdueAppointments = appointmentsSnap.docs.filter((appointmentDoc) => {
    const appointment = appointmentDoc.data() as AppointmentRecord;
    if (!appointment.date || !appointment.time || !appointment.status) return false;
    if (FINALIZED_STATUSES.has(appointment.status)) return false;

    try {
      return parseAppointmentDateTime(appointment.date, appointment.time) < now;
    } catch {
      return false;
    }
  });

  if (overdueAppointments.length === 0) {
    console.log('Nenhum agendamento pendente encontrado.');
    return;
  }

  const overdueIds = overdueAppointments.map((appointmentDoc) => appointmentDoc.id);
  const notifiedAppointmentIds = new Set<string>();
  const queryChunkSize = 30;

  for (let index = 0; index < overdueIds.length; index += queryChunkSize) {
    const chunk = overdueIds.slice(index, index + queryChunkSize);
    const notificationsSnap = await db
      .collection('notifications')
      .where('appointmentId', 'in', chunk)
      .where('read', '==', false)
      .get();

    notificationsSnap.forEach((notificationDoc) => {
      const notification = notificationDoc.data() as NotificationRecord;
      if (notification.appointmentId) {
        notifiedAppointmentIds.add(notification.appointmentId);
      }
    });
  }

  const pendingNotifications = overdueAppointments.filter((appointmentDoc) => !notifiedAppointmentIds.has(appointmentDoc.id));
  if (pendingNotifications.length === 0) {
    console.log('Todos os agendamentos pendentes já possuem notificação aberta.');
    return;
  }

  const patientIds = [...new Set(pendingNotifications.map((appointmentDoc) => (appointmentDoc.data() as AppointmentRecord).patientId).filter(Boolean) as string[])];
  const patientMap = new Map<string, string>();

  if (patientIds.length > 0) {
    const patientRefs = patientIds.map((patientId) => db.collection('patients').doc(patientId));
    const patientSnapshots = await db.getAll(...patientRefs);
    patientSnapshots.forEach((patientSnap) => {
      if (patientSnap.exists) {
        patientMap.set(patientSnap.id, ((patientSnap.data() as PatientRecord).name || 'Paciente'));
      }
    });
  }

  let batch = db.batch();
  let batchCount = 0;
  const batchLimit = 500;

  for (const appointmentDoc of pendingNotifications) {
    const appointment = appointmentDoc.data() as AppointmentRecord;
    const dentistAuthUid = appointment.dentistAuthUid;
    if (!dentistAuthUid || !appointment.time) {
      continue;
    }

    const patientName = appointment.patientId ? (patientMap.get(appointment.patientId) || 'Paciente') : 'Paciente';
    const notificationRef = db.collection('notifications').doc();
    batch.set(notificationRef, buildNotificationPayload(dentistAuthUid, appointmentDoc.id, patientName, appointment.time));
    batchCount += 1;

    if (batchCount === batchLimit) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`${pendingNotifications.length} notificação(ões) de agendamento pendente criada(s).`);
}

run().catch((error) => {
  console.error('Falha ao processar notificações pendentes:', error);
  process.exitCode = 1;
});
