import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Inicialização do Admin SDK
//
// Quando rodando dentro do Firebase Cloud Functions, as credenciais e o
// projectId são detectados automaticamente via Application Default Credentials
// (ADC). Basta chamar initializeApp() sem argumentos.
// ---------------------------------------------------------------------------
const adminApp: App = initializeApp();

// ID do banco Firestore nomeado do projeto BM Odonto.
// Substitua pela string "(default)" caso migre para o banco padrão.
const DATABASE_ID = "ai-studio-f268cd8f-e6a5-4bba-b421-df1c4dc1d11c";

const db = getFirestore(adminApp, DATABASE_ID);

// ---------------------------------------------------------------------------
// Tipos internos das Cloud Functions
// ---------------------------------------------------------------------------

type NotificationType = "success" | "info" | "error" | "warning";

interface NotificationPayload {
  userId: string;
  message: string;
  type: NotificationType;
  appointmentId: string | null;
  createdAt: number;
  read: boolean;
}

// Status que indicam que o agendamento está finalizado e não deve gerar alerta.
const FINALIZED_STATUSES = new Set([
  "completed",
  "Concluído",
  "cancelled",
  "Cancelado",
  "blocked",
  "Bloqueado",
]);

// ---------------------------------------------------------------------------
// Helper: converte os campos `date` (string) e `time` (string) do agendamento
// para um objeto Date.
// Suporta formato brasileiro "DD/MM/YYYY" e ISO "YYYY-MM-DD".
// ---------------------------------------------------------------------------
function parseAppointmentDateTime(date: string, time: string): Date {
  let day: number, month: number, year: number;

  if (date.includes("/")) {
    // Formato brasileiro: DD/MM/YYYY
    const parts = date.split("/");
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1; // mês base-0
    year = parseInt(parts[2], 10);
  } else {
    // Formato ISO: YYYY-MM-DD
    const parts = date.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  }

  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month, day, hours, minutes, 0);
}

// ---------------------------------------------------------------------------
// Função 1 – Trigger: onAppointmentCreated
//
// Dispara quando um novo documento é criado em appointments/{appointmentId}.
// Cria uma notificação do tipo "success" para o dentista responsável.
// ---------------------------------------------------------------------------
export const onAppointmentCreated = onDocumentCreated(
  {
    document: "appointments/{appointmentId}",
    database: DATABASE_ID,
    region: "us-central1",
  },
  async (event) => {
    const appointmentId = event.params.appointmentId;
    const data = event.data?.data();

    if (!data) {
      logger.warn("onAppointmentCreated: documento vazio", { appointmentId });
      return;
    }

    const { dentistId, patientId, time } = data as {
      dentistId?: string;
      patientId?: string;
      time?: string;
    };

    if (!dentistId || !patientId) {
      logger.warn("onAppointmentCreated: dentistId ou patientId ausente", {
        appointmentId,
      });
      return;
    }

    // Busca o nome do paciente; usa fallback se não encontrado.
    let patientName = "Paciente";
    try {
      const patientSnap = await db.collection("patients").doc(patientId).get();
      if (patientSnap.exists) {
        patientName =
          (patientSnap.data() as { name?: string }).name ?? "Paciente";
      } else {
        logger.warn("onAppointmentCreated: paciente não encontrado", {
          patientId,
        });
      }
    } catch (err) {
      logger.warn("onAppointmentCreated: erro ao buscar paciente", {
        patientId,
        err,
      });
    }

    const notification: NotificationPayload = {
      userId: dentistId,
      message: `Novo agendamento: ${patientName} às ${time ?? "horário indefinido"}`,
      type: "success",
      appointmentId,
      createdAt: Date.now(),
      read: false,
    };

    try {
      await db.collection("notifications").add(notification);
      logger.info("onAppointmentCreated: notificação criada", {
        dentistId,
        appointmentId,
      });
    } catch (err) {
      logger.error("onAppointmentCreated: erro ao criar notificação", { err });
    }
  }
);

// ---------------------------------------------------------------------------
// Função 2 – Agendada: checkOverdueAppointments
//
// Roda a cada 15 minutos. Varre appointments buscando registros cuja
// data+hora já passou e cujo status não é finalizado. Para cada um que
// ainda não possua uma notificação pendente, cria uma notificação "info".
// ---------------------------------------------------------------------------
export const checkOverdueAppointments = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    timeZone: "America/Sao_Paulo",
  },
  async (_event) => {
    const now = new Date();

    // 1. Busca todos os agendamentos (filtragem de status/data em memória pois
    //    os campos são strings sem índice de timestamp).
    let appointmentsSnap: FirebaseFirestore.QuerySnapshot;
    try {
      appointmentsSnap = await db.collection("appointments").get();
    } catch (err) {
      logger.error("checkOverdueAppointments: erro ao buscar agendamentos", {
        err,
      });
      return;
    }

    interface AppointmentData {
      dentistId: string;
      patientId: string;
      date: string;
      time: string;
      status: string;
    }

    const overdueAppointments = appointmentsSnap.docs.filter((doc) => {
      const d = doc.data() as Partial<AppointmentData>;
      if (!d.status || FINALIZED_STATUSES.has(d.status)) return false;
      if (!d.date || !d.time) return false;
      try {
        return parseAppointmentDateTime(d.date, d.time) < now;
      } catch {
        return false;
      }
    });

    if (overdueAppointments.length === 0) {
      logger.info("checkOverdueAppointments: nenhum agendamento atrasado");
      return;
    }

    logger.info(
      `checkOverdueAppointments: ${overdueAppointments.length} agendamento(s) atrasado(s)`
    );

    // 2. Verifica quais já possuem notificação pendente (não lida).
    //    A operação "in" do Firestore aceita até 30 valores por query; dividimos
    //    em chunks.
    const overdueIds = overdueAppointments.map((d) => d.id);
    const existingNotifiedIds = new Set<string>();
    const QUERY_CHUNK = 30;

    for (let i = 0; i < overdueIds.length; i += QUERY_CHUNK) {
      const chunk = overdueIds.slice(i, i + QUERY_CHUNK);
      try {
        const existing = await db
          .collection("notifications")
          .where("appointmentId", "in", chunk)
          .where("read", "==", false)
          .get();
        existing.docs.forEach((d) => {
          const aid = (d.data() as { appointmentId?: string }).appointmentId;
          if (aid) existingNotifiedIds.add(aid);
        });
      } catch (err) {
        logger.error(
          "checkOverdueAppointments: erro ao verificar notificações existentes",
          { err }
        );
      }
    }

    // 3. Coleta os dados dos agendamentos sem notificação.
    const pending = overdueAppointments.filter(
      (doc) => !existingNotifiedIds.has(doc.id)
    );

    if (pending.length === 0) {
      logger.info(
        "checkOverdueAppointments: todos já possuem notificação pendente"
      );
      return;
    }

    // 4. Busca nomes dos pacientes em lote (uma única chamada getAll).
    const uniquePatientIds = [
      ...new Set(
        pending.map((d) => (d.data() as AppointmentData).patientId).filter(Boolean)
      ),
    ];

    const patientMap = new Map<string, string>();
    if (uniquePatientIds.length > 0) {
      try {
        const patientRefs = uniquePatientIds.map((id) =>
          db.collection("patients").doc(id)
        );
        const patientSnaps = await db.getAll(...patientRefs);
        patientSnaps.forEach((snap) => {
          if (snap.exists) {
            patientMap.set(
              snap.id,
              (snap.data() as { name?: string }).name ?? "Paciente"
            );
          }
        });
      } catch (err) {
        logger.warn("checkOverdueAppointments: erro ao buscar pacientes", {
          err,
        });
        // patientMap ficará vazio; o fallback "Paciente" será usado
      }
    }

    // 5. Grava as novas notificações em batches de até 500 operações.
    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of pending) {
      const d = doc.data() as AppointmentData;
      const patientName = patientMap.get(d.patientId) ?? "Paciente";

      const notification: NotificationPayload = {
        userId: d.dentistId,
        message: `Agendamento pendente: ${patientName} às ${d.time}`,
        type: "info",
        appointmentId: doc.id,
        createdAt: Date.now(),
        read: false,
      };

      batch.set(db.collection("notifications").doc(), notification);
      batchCount++;

      if (batchCount === BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(
      `checkOverdueAppointments: ${pending.length} notificação(ões) criada(s)`
    );
  }
);
