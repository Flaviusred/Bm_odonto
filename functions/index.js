// Firebase Cloud Function: agendarConsulta
// Recebe: { calendarId, emailPaciente, dataInicio, dataFim, nomeProcedimento }
// Usa Service Account JSON armazenado no Secret Manager (recomendado) ou em env var

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

let SecretManagerServiceClient = null;
try {
  SecretManagerServiceClient = require('@google-cloud/secret-manager').SecretManagerServiceClient;
} catch (e) {
  console.warn('Secret Manager client not available; falling back to SERVICE_ACCOUNT_JSON env or functions.config');
}

admin.initializeApp();
const secretClient = SecretManagerServiceClient ? new SecretManagerServiceClient() : null;

// Carrega as credenciais da Service Account.
// Ordem de tentativa:
// 1) SECRET via env var SERVICE_ACCOUNT_SECRET_NAME (Secret Manager)
// 2) VAR de ambiente SERVICE_ACCOUNT_JSON (conteúdo JSON)
// 3) firebase functions:config() -> functions.config().service_account.json (dev)
async function loadServiceAccountKey() {
  const secretName = process.env.SERVICE_ACCOUNT_SECRET_NAME || (functions.config && functions.config().service_account && functions.config().service_account.secret_name);
  // tentativa Secret Manager (apenas se o cliente estiver disponível)
  if (secretName && secretClient) {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_EMULATOR_PROJECT_ID;
    if (!projectId) throw new Error('GCP project id not available in env');
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload && version.payload.data ? version.payload.data.toString('utf8') : null;
    if (!payload) throw new Error('Secret payload empty');
    return JSON.parse(payload);
  } else if (secretName && !secretClient) {
    console.warn('SERVICE_ACCOUNT_SECRET_NAME provided but SecretManager client is not installed; skipping Secret Manager retrieval');
  }

  // tentativa env JSON
  if (process.env.SERVICE_ACCOUNT_JSON) {
    try { return JSON.parse(process.env.SERVICE_ACCOUNT_JSON); } catch (e) { throw new Error('Invalid SERVICE_ACCOUNT_JSON'); }
  }

  // tentativa firebase functions config (dev)
  if (functions.config && functions.config().service_account && functions.config().service_account.json) {
    try { return JSON.parse(functions.config().service_account.json); } catch (e) { throw new Error('Invalid functions.config().service_account.json'); }
  }

  throw new Error('No service account credentials provided. Set SERVICE_ACCOUNT_SECRET_NAME or SERVICE_ACCOUNT_JSON or functions.config().service_account.json');
}

// Callable function
exports.agendarConsulta = functions.https.onCall(async (data, context) => {
  const { calendarId, emailPaciente, dataInicio, dataFim, nomeProcedimento } = data || {};

  if (!calendarId || !emailPaciente || !dataInicio || !dataFim || !nomeProcedimento) {
    throw new functions.https.HttpsError('invalid-argument', 'Parâmetros requeridos ausentes');
  }

  try {
    const key = await loadServiceAccountKey();

    // JWT client com escopo do Calendar
    const jwtClient = new google.auth.JWT(
      key.client_email,
      null,
      key.private_key,
      ['https://www.googleapis.com/auth/calendar']
    );

    // Autoriza (obtém access token via Service Account)
    await jwtClient.authorize();

    const calendar = google.calendar({ version: 'v3', auth: jwtClient });

    const event = {
      summary: nomeProcedimento,
      description: `Consulta agendada via sistema`,
      start: { dateTime: new Date(dataInicio).toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: new Date(dataFim).toISOString(), timeZone: 'America/Sao_Paulo' },
      attendees: [{ email: emailPaciente }]
    };

    const res = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendUpdates: 'all' // importante: envia convite/notificações para o paciente
    });

    return { success: true, eventId: res.data.id, raw: res.data };
  } catch (err) {
    console.error('agendarConsulta error:', err);
    throw new functions.https.HttpsError('internal', 'Falha ao agendar consulta', { message: err.message || String(err) });
  }
});
