import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import adminModule from 'firebase-admin';
// Some environments/packagers expose firebase-admin as a default export,
// others as the module namespace. Normalize to `admin` variable.
const admin: any = (adminModule as any)?.default || adminModule;
import { google } from "googleapis";

dotenv.config();

// Initialize Firebase Admin SDK (server-side)
try {
  const apps = (admin && admin.apps) ? admin.apps : [];
  if (apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount as any) });
    } else {
      admin.initializeApp();
    }
  }
} catch (e) {
  console.warn('Firebase admin init warning:', e);
}

let db: any = null;
try {
  if (admin && typeof admin.firestore === 'function') db = admin.firestore();
  else if (admin && admin.default && typeof admin.default.firestore === 'function') db = admin.default.firestore();
} catch (e) {
  console.warn('Failed to initialize Firestore instance:', e);
}

if (!db) {
  console.warn('Firestore not initialized. Firestore-dependent endpoints will fail until configured.');
}

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), "data.json");

// Simple file-based debug logger for email flows (helps capture logs when
// server output isn't visible in the terminal session)
const DEBUG_LOG_DIR = path.join(process.cwd(), 'tmp');
const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, 'email-debug.log');
try { if (!fs.existsSync(DEBUG_LOG_DIR)) fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true }); } catch (e) {}
const appendDebugLog = (line: string) => {
  try { fs.appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${line}\n`); } catch (e) { /* ignore */ }
};

app.use(express.json({ limit: '50mb' }));

// Initial data structure
const initialData = {
  patients: [],
  dentists: [],
  appointments: [],
  settings: {
    emailReminders: true,
    reminderHoursBefore: 24
  }
};

// Helper to read/write data
const getData = () => {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
};

const saveData = (data: any) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// --- Firebase helpers for storing/fetching Google tokens ---
const saveTokensForUserFirebase = async (userId: string, role: 'dentist' | 'patient', tokens: any) => {
  try {
    const col = role === 'dentist' ? 'dentists' : 'patients';
    await db.collection(col).doc(userId).set({ googleTokens: tokens }, { merge: true });
    // Also keep local data.json in sync when present (backwards compatibility)
    try {
      const data = getData();
      if (role === 'dentist') {
        const idx = (data.dentists || []).findIndex((d: any) => d.id === userId);
        if (idx !== -1) data.dentists[idx].googleTokens = tokens;
        else {
          data.dentists = data.dentists || [];
          data.dentists.push({ id: userId, name: '', email: '', googleTokens: tokens });
        }
      } else {
        const idx = (data.patients || []).findIndex((p: any) => p.id === userId);
        if (idx !== -1) data.patients[idx].googleTokens = tokens;
        else {
          data.patients = data.patients || [];
          data.patients.push({ id: userId, name: '', email: '', googleTokens: tokens });
        }
      }
      saveData(data);
    } catch (e) {
      console.warn('Failed to update local data.json with googleTokens', e);
    }
  } catch (e) {
    console.warn('Failed to save tokens to Firestore', e);
    throw e;
  }
};

const getTokensForUserFirebase = async (userId: string, role: 'dentist' | 'patient') => {
  try {
    const col = role === 'dentist' ? 'dentists' : 'patients';
    const doc = await db.collection(col).doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return (data && (data as any).googleTokens) ? (data as any).googleTokens : null;
  } catch (e) {
    console.warn('Failed to read tokens from Firestore', e);
    return null;
  }
};

// Google OAuth Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Google Auth URL (supports dentist or patient by passing userId & role)
app.get("/api/auth/google/url", (req, res) => {
  const userId = (req.query.userId || req.query.dentistId) as string;
  const role = (req.query.role || (req.query.dentistId ? 'dentist' : 'patient')) as string;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const state = JSON.stringify({ id: userId, role });
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
    prompt: "consent",
    include_granted_scopes: true
  });
  res.json({ url });
});

// Google Auth Callback
app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  let parsedState: { id?: string; role?: string } = {};
  if (typeof state === 'string') {
    try {
      parsedState = JSON.parse(state);
    } catch (e) {
      // backward-compat: state may be a plain dentistId string
      parsedState = { id: state as string, role: 'dentist' };
    }
  }
  const id = parsedState.id;
  const role = parsedState.role || 'dentist';

  if (!id) {
    return res.status(400).send('Missing state information');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // Persist tokens into Firestore (and keep local data.json in sync)
    const saveRole = role === 'patient' ? 'patient' : 'dentist';
    try {
      await saveTokensForUserFirebase(id, saveRole as 'dentist' | 'patient', tokens);
    } catch (e) {
      console.warn('Failed to persist google tokens to Firestore, falling back to local storage', e);
      const data = getData();
      if (saveRole === 'dentist') {
        const dentistIndex = data.dentists.findIndex((d: any) => d.id === id);
        if (dentistIndex !== -1) data.dentists[dentistIndex].googleTokens = tokens;
        else {
          data.dentists = data.dentists || [];
          data.dentists.push({ id, name: '', email: '', googleTokens: tokens });
        }
      } else {
        const patientIndex = data.patients.findIndex((p: any) => p.id === id);
        if (patientIndex !== -1) data.patients[patientIndex].googleTokens = tokens;
        else {
          data.patients = data.patients || [];
          data.patients.push({ id, name: '', email: '', googleTokens: tokens });
        }
      }
      saveData(data);
    }

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Google Calendar connected successfully! This window will close.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

const syncToGoogleCalendar = async (appointment: any, targetUser: any, patient: any, dentist: any, role: 'dentist' | 'patient' = 'dentist') => {
  try {
    if (!targetUser || !targetUser.id) return;

    // Try to get tokens from the in-memory object first, otherwise from Firestore
    let tokens = targetUser.googleTokens;
    if (!tokens) {
      tokens = await getTokensForUserFirebase(targetUser.id, role);
    }
    if (!tokens) return;

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth });

    const startDateTime = new Date(`${appointment.date}T${appointment.time}`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

    const event = {
      summary: `Consulta Odontológica: ${patient.name}`,
      description: `Paciente: ${patient.name}\nDentista: ${dentist?.name || ''}\nObservações: ${appointment.notes || 'Nenhuma'}`,
      start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Sao_Paulo' }
    };

    // Ensure per-user event mapping exists
    appointment.googleEvents = appointment.googleEvents || {};
    const existingEventId = appointment.googleEvents[targetUser.id];

    if (existingEventId) {
      try {
        await calendar.events.update({ calendarId: 'primary', eventId: existingEventId, requestBody: event });
      } catch (updateErr) {
        // fallback to insert if update fails
        const insertRes = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
        appointment.googleEvents[targetUser.id] = insertRes.data.id;
      }
    } else {
      const insertRes = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
      appointment.googleEvents[targetUser.id] = insertRes.data.id;
    }
  } catch (error) {
    console.error('Error syncing to Google Calendar:', error);
  }
};

// Helper: create an event for a dentist using stored refresh_token in Firestore
const createGoogleEventForDentist = async (dentistId: string, eventBody: any) => {
  const tokens = await getTokensForUserFirebase(dentistId, 'dentist');
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Dentist not connected to Google Calendar (missing refresh_token)');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });

  // Try to ensure access token is available (this will use refresh_token behind the scenes)
  try {
    await oauth2Client.getAccessToken();
  } catch (e) {
    console.warn('Failed to obtain access token using refresh_token', e);
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
  return res.data;
};

// Endpoint to insert a test event for a dentist (useful for verifying integration)
app.post('/api/google/insert-test-event', async (req, res) => {
  const dentistId = req.body?.dentistId;
  if (!dentistId) return res.status(400).json({ error: 'dentistId is required' });
  const start = req.body?.start || new Date().toISOString();
  const end = req.body?.end || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const eventBody = {
    summary: req.body?.summary || 'Consulta de Avaliação',
    description: req.body?.description || 'Agendamento automático pelo sistema',
    start: { dateTime: start, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end, timeZone: 'America/Sao_Paulo' }
  };

  try {
    const ev = await createGoogleEventForDentist(dentistId, eventBody);
    res.json({ status: 'ok', event: ev });
  } catch (err) {
    console.error('/api/google/insert-test-event error', err);
    res.status(500).json({ error: 'failed to create event', details: err instanceof Error ? err.message : String(err) });
  }
});

app.put("/api/users/:id", (req, res) => {
  const { id } = req.params;
  const updatedUser = req.body;
  const data = getData();
  
  if (!data.users) data.users = [];
  
  const userIndex = data.users.findIndex((u: any) => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  data.users[userIndex] = { ...data.users[userIndex], ...updatedUser };
  saveData(data);
  res.json({ status: "ok", user: data.users[userIndex] });
});

// API Routes
app.get("/api/data", (req, res) => {
  res.json(getData());
});

app.post("/api/send-email", async (req, res) => {
  const { to, subject, text, html } = req.body;
  if (!to || String(to).trim() === '') {
    console.warn('/api/send-email called without recipient');
    return res.status(400).json({ error: 'Recipient (to) is required' });
  }
  console.log(`/api/send-email called -> to=${to} html=${!!html} text=${!!text} subject=${subject}`);
  appendDebugLog(`/api/send-email called -> to=${to} html=${!!html} text=${!!text} subject=${subject}`);
  try {
    const useRaw = !!req.body?.raw;
    const info = useRaw ? await sendRawEmail(to, subject, text, html) : await sendEmail(to, subject, text, html);
    res.json({ status: "ok", info: { messageId: (info as any)?.messageId, accepted: (info as any)?.accepted, rejected: (info as any)?.rejected } });
  } catch (error) {
    console.error('/api/send-email error:', error);
    res.status(500).json({ error: "Failed to send email", details: error instanceof Error ? error.message : String(error) });
  }
});

// Web-friendly endpoint to trigger a test email (useful in production admin panel)
app.post('/api/send-test-email', async (req, res) => {
  const to = req.body?.to || process.env.EMAIL_USER;
  const subject = req.body?.subject || 'Teste de envio - OdontoClinic';
  const text = req.body?.text || `Teste de envio em ${new Date().toLocaleString()}`;
  const useRaw = !!req.body?.raw;

  try {
    const info = useRaw ? await sendRawEmail(to, subject, text) : await sendEmail(to, subject, text);
    res.json({ status: 'ok', info: { messageId: (info as any)?.messageId } });
  } catch (err) {
    console.error('/api/send-test-email error:', err);
    res.status(500).json({ error: 'Failed to send test email', details: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/check-email-config", (req, res) => {
  const provider = (process.env.SMTP_PROVIDER || 'gmail').toLowerCase();
  let isConfigured = false;
  if (provider === 'sendgrid' || provider === 'sendgrid-smtp') {
    isConfigured = !!process.env.SENDGRID_API_KEY;
  } else if (provider === 'smtp') {
    isConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!(process.env.SMTP_PASS || process.env.SMTP_PASS);
  } else {
    isConfigured = !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;
  }

  res.json({ isConfigured, provider });
});

// Google connection status for a given user (dentist or patient)
app.get('/api/google/status', async (req, res) => {
  const userId = String(req.query.userId || req.query.id || '');
  const role = String(req.query.role || 'dentist');
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    // Prefer Firestore
    const tokens = await getTokensForUserFirebase(userId, role === 'patient' ? 'patient' : 'dentist');
    let connected = !!tokens;
    if (!connected) {
      // fallback to local file storage for backward compatibility
      const data = getData();
      if (role === 'dentist') {
        const dentist = (data.dentists || []).find((d: any) => d.id === userId);
        connected = !!(dentist && dentist.googleTokens);
      } else {
        const patient = (data.patients || []).find((p: any) => p.id === userId);
        connected = !!(patient && patient.googleTokens);
      }
    }
    res.json({ connected });
  } catch (err) {
    console.error('/api/google/status error:', err);
    res.status(500).json({ error: 'Failed to read status', details: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/cbmpb/:identifier", async (req, res) => {
  // Limpar o identificador para garantir que apenas números sejam enviados
  const identifier = req.params.identifier.replace(/\D/g, '');
  const rawToken = process.env.CBMPB_API_TOKEN;
  
  if (!rawToken) {
    console.error("CBMPB_API_TOKEN não configurado");
    return res.status(500).json({ error: "Token não configurado no servidor" });
  }

  let token = rawToken.trim();
  
  // Se o usuário colou o cabeçalho inteiro "Authorization: Bearer ...", limpa para pegar só o código
  if (token.startsWith('Authorization:')) {
    token = token.replace(/^Authorization:\s*/i, '');
  }
  if (token.startsWith('Bearer ')) {
    token = token.replace(/^Bearer\s+/i, '');
  }
  
  // Log mascarado para conferência (apenas no console do servidor)
  console.log(`Token detectado (Tamanho: ${token.length}): ${token.substring(0, 10)}...${token.substring(token.length - 10)}`);

  try {
    const url = `https://bravo.bombeiros.pb.gov.br/api/v1/pbsaude/servidor/${identifier}`;
    console.log(`Buscando em: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://bravo.bombeiros.pb.gov.br/',
        'Origin': 'https://bravo.bombeiros.pb.gov.br'
      }
    });
    
    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    console.log(`Body: ${responseText}`);
    
    // Status 203 com corpo vazio geralmente indica problema de permissão ou token inválido na API Bravo
    if (response.status === 203 && (!responseText || responseText.trim() === "")) {
        return res.status(401).json({ 
          error: "Acesso não autorizado ou Token inválido (Status 203)", 
          details: "A API retornou uma resposta sem dados. Verifique se o Token tem permissão para o módulo pbsaude." 
        });
    }

    if (!response.ok) {
        return res.status(response.status).json({ error: `API error: ${responseText}` });
    }
    
    if (!responseText || responseText.trim() === "") {
        return res.status(200).json({});
    }

    try {
      const data = JSON.parse(responseText);
      res.json(data);
    } catch (e) {
      console.error("Erro ao parsear JSON:", e);
      res.status(500).json({ error: "Resposta da API não é um JSON válido", body: responseText });
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
  }
});

// API: request server to sync a single appointment to connected Google Calendars
app.post('/api/sync-appointment', async (req, res) => {
  const apt = req.body?.appointment;
  if (!apt || !apt.id) return res.status(400).json({ error: 'appointment (with id) is required' });
  try {
    const data = getData();
    const dentist = (data.dentists || []).find((d: any) => d.id === apt.dentistId);
    const patient = (data.patients || []).find((p: any) => p.id === apt.patientId);

    // Attempt to sync for dentist and patient; syncToGoogleCalendar will fetch tokens from Firestore if needed
    await syncToGoogleCalendar(apt, dentist, patient || {}, dentist, 'dentist');
    await syncToGoogleCalendar(apt, patient, patient, dentist || {}, 'patient');

    // persist mapping back to server data if appointment exists in data.json
    const existing = (data.appointments || []).find((a: any) => a.id === apt.id);
    if (existing) {
      existing.googleEvents = apt.googleEvents || existing.googleEvents || {};
      saveData(data);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('/api/sync-appointment error:', err);
    res.status(500).json({ error: 'failed to sync appointment', details: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/data", async (req, res) => {
  const oldData = getData();
  const newData = req.body;
  
  // Preserve Google tokens if they are missing in the incoming data
  newData.dentists = newData.dentists.map((newDentist: any) => {
    const oldDentist = oldData.dentists.find((d: any) => d.id === newDentist.id);
    if (oldDentist && oldDentist.googleTokens && !newDentist.googleTokens) {
      return { ...newDentist, googleTokens: oldDentist.googleTokens };
    }
    return newDentist;
  });

  // Detect new or updated appointments to sync with Google Calendar
  const newAppointments = newData.appointments.filter((newApt: any) => {
    const oldApt = oldData.appointments.find((a: any) => a.id === newApt.id);
    return !oldApt || JSON.stringify(oldApt) !== JSON.stringify(newApt);
  });

  for (const apt of newAppointments) {
    const dentist = newData.dentists.find((d: any) => d.id === apt.dentistId);
    const patient = newData.patients.find((p: any) => p.id === apt.patientId);
    if (dentist && patient) {
      await syncToGoogleCalendar(apt, dentist, patient, dentist, 'dentist');
      await syncToGoogleCalendar(apt, patient, patient, dentist, 'patient');
    }
  }

  saveData(newData);
  res.json({ status: "ok" });
});

// Endpoint auxiliar: preencher e-mails ausentes de dependentes com o e-mail do titular
app.post('/api/fix-dependents-emails', (req, res) => {
  try {
    const data = getData();
    let updated = 0;

    // Para cada paciente que é dependente, copiar e-mail e telefone do titular quando ausentes
    data.patients = (data.patients || []).map((p: any) => {
      if (p.dependentOf) {
        const titular = (data.patients || []).find((t: any) => t.id === p.dependentOf);
        if (titular) {
          let changed = false;
          // email
          if ((!p.email || String(p.email).trim() === '') && (titular.email && String(titular.email).trim() !== '')) {
            p.email = titular.email;
            changed = true;
          }
          // phone (aceita titular.phone ou titular.telefone)
          const titularPhone = titular.phone || titular.telefone || '';
          if ((!p.phone || String(p.phone).trim() === '') && titularPhone) {
            p.phone = titularPhone;
            changed = true;
          }
          if (changed) updated++;
        }
      }
      return p;
    });

    saveData(data);
    res.json({ status: 'ok', updated });
  } catch (err) {
    console.error('fix-dependents-emails error:', err);
    res.status(500).json({ error: 'Failed to backfill dependent emails', details: err instanceof Error ? err.message : String(err) });
  }
});

// Reminder Logic
// Create a nodemailer transporter based on environment configuration.
const createTransportFromEnv = () => {
  const provider = (process.env.SMTP_PROVIDER || "gmail").toLowerCase();

  try {
    if (provider === "sendgrid" || provider === "sendgrid-smtp") {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) throw new Error("SENDGRID_API_KEY not configured");
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.sendgrid.net",
        port: Number(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_SECURE === "true") || false,
        auth: {
          user: process.env.SENDGRID_SMTP_USER || "apikey",
          pass: apiKey,
        },
      });
    }

    if (provider === "smtp") {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = process.env.SMTP_SECURE === "true";
      if (!host) throw new Error("SMTP_HOST not configured");
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    // Default: Gmail using app password (legacy but works with App Passwords)
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } catch (err) {
    console.error("Error creating transporter:", err);
    throw err;
  }
};

const sendEmail = async (to: string, subject: string, text?: string, html?: string) => {
  // Ensure at least one recipient and some configuration exists
  if (!to) {
    throw new Error("No recipient specified");
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || `no-reply@${process.env.DOMAIN || "example.com"}`;

  let transporter;
  try {
    transporter = createTransportFromEnv();
  } catch (err) {
    console.error("Transport configuration error:", err);
    throw err;
  }

  try {
    // Optional verify in dev/prod to fail early
    if (process.env.NODE_ENV !== "test") {
      try { await transporter.verify(); } catch (vErr) { console.warn("SMTP verify warning:", vErr); }
    }

    // Ensure emails include the CBMPB header (logo + Direitoria de Saúde / Bravo Odonto)
    const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
    const logoUrl = `${siteUrl}/brasao-BM.png`;

    // Use CID embedded image so the logo is shown even when external URLs are blocked
    const logoCid = 'brasao_bm';
    const wrapHeader = (bodyHtml: string) => `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Bravo Odonto</title>
        </head>
        <body style="margin:0;padding:0;font-family:Arial, sans-serif;color:#111">
          <div style="text-align:center;padding:12px 0">
            <img src="cid:${logoCid}" alt="CBMPB" style="width:120px;height:auto;display:block;margin:0 auto" />
            <div style="font-weight:700;margin-top:8px">Diretoria de Saúde<br/>Bravo Odonto</div>
            <hr style="margin:12px 0"/>
          </div>
          <div style="padding:0 12px">${bodyHtml}</div>
        </body>
      </html>
    `;

    const containsHeader = (s: string) => {
      if (!s) return false;
      // Detect only explicit header markers: embedded CID image or the specific header block
      const hasCid = /cid:brasao_bm|<img[^>]*cid:brasao_bm/i.test(s);
      const hasHeaderBlock = /Diretoria de Saúde\s*<br\s*\/?>(?:\s|\S)*?Bravo Odonto/i.test(s);
      const hasFileName = /brasao-BM\.png/i.test(s);
      return hasCid || hasHeaderBlock || hasFileName;
    };

    const escapeHtml = (unsafe: string) => {
      return (unsafe || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/\'/g, '&#039;');
    };

    let finalHtml: string | undefined = undefined;

    if (html) {
      if (containsHeader(html)) {
        finalHtml = html;
      } else {
        finalHtml = wrapHeader(html);
      }
    } else if (text) {
      // convert text to simple HTML and wrap header
      const body = `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
      finalHtml = wrapHeader(body + `<hr/><p style="font-size:12px;color:#666">Este é um e-mail automático do Bravo Odonto.</p>`);
    }
    
      // Debugging: log header detection results (avoid dumping full html)
      try {
        const dbgLine = `sendEmail: to=${to} htmlPresent=${!!html} htmlLength=${html ? html.length : 0} containsHeader=${containsHeader(html || '')} finalHtmlLength=${finalHtml ? finalHtml.length : 0}`;
        console.log(dbgLine);
        appendDebugLog(dbgLine);
      } catch (dbgErr) { console.warn('sendEmail debug log error', dbgErr); }

    // Prepare mail options and attach logo inline (CID)
    const plain = text || (finalHtml ? finalHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ') : undefined);

    const attachments: any[] = [];
    try {
      const logoPath = path.join(process.cwd(), 'public', 'brasao-BM.png');
      if (fs.existsSync(logoPath)) {
        attachments.push({ filename: 'brasao-BM.png', path: logoPath, cid: 'brasao_bm' });
      }
    } catch (e) {
      // ignore attachment errors
    }

    const mailOptions: any = { from: fromAddress, to, subject, attachments };

    // Prefer strings for text/html so nodemailer can add the charset
    // parameter automatically. Using Buffer for the text part can cause
    // some transports to omit the charset and clients to mis-decode
    // acentuação — use plain strings and hint encoding explicitly.
    if (finalHtml) {
      mailOptions.html = finalHtml;
    }

    if (plain) {
      mailOptions.text = plain;
    } else if (finalHtml && !mailOptions.text) {
      const derivedText = finalHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      mailOptions.text = derivedText;
    }

    // Hint nodemailer about encoding
    mailOptions.encoding = 'utf-8';

    // Debugging: log mailOptions html snippet and attachments
    try {
      const mailDbg = `mailOptions debug: to=${to} attachments=${attachments.length} htmlStartsWith=${(mailOptions.html || '').slice(0,120).replace(/\n/g,' ')}...`;
      console.log(mailDbg);
      appendDebugLog(mailDbg);
    } catch (dbg) { console.warn('mailOptions debug error', dbg); }

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to} (id=${(info as any).messageId})`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// Support sending raw MIME messages (multipart/related with inline image)
const sendRawEmail = async (to: string, subject: string, text?: string, html?: string) => {
  if (!to) throw new Error('No recipient specified');
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || `no-reply@${process.env.DOMAIN || 'example.com'}`;

  let transporter;
  try { transporter = createTransportFromEnv(); } catch (err) { console.error('Transport configuration error (raw):', err); throw err; }

  // Build HTML wrapper like in sendEmail
  const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  const logoCid = 'brasao_bm';
  const wrapHeader = (bodyHtml: string) => `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body style="margin:0;padding:0;font-family:Arial, sans-serif;color:#111">
        <div style="text-align:center;padding:12px 0">
          <img src="cid:${logoCid}" alt="CBMPB" style="width:120px;height:auto;display:block;margin:0 auto" />
          <div style="font-weight:700;margin-top:8px">Diretoria de Saúde<br/>Bravo Odonto</div>
          <hr style="margin:12px 0"/>
        </div>
        <div style="padding:0 12px">${bodyHtml}</div>
      </body>
    </html>
  `;

  const escapeHtml = (unsafe: string) => (unsafe || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\'/g,'&#039;');

  let finalHtml: string | undefined;
  const rawContainsHeader = (s: string) => {
    if (!s) return false;
    const hasCid = /cid:brasao_bm|<img[^>]*cid:brasao_bm/i.test(s);
    const hasHeaderBlock = /Diretoria de Saúde\s*<br\s*\/?>(?:\s|\S)*?Bravo Odonto/i.test(s);
    const hasFileName = /brasao-BM\.png/i.test(s);
    return hasCid || hasHeaderBlock || hasFileName;
  };

  if (html) finalHtml = rawContainsHeader(html) ? html : wrapHeader(html);
  else if (text) {
    const body = `<p>${escapeHtml(text).replace(/\n/g,'<br/>')}</p>`;
    finalHtml = wrapHeader(body + `<hr/><p style="font-size:12px;color:#666">Este é um e-mail automático do Bravo Odonto.</p>`);
  }

  // Debugging: log header detection results (avoid dumping full html)
  try {
    console.log(`sendRawEmail: to=${to} htmlPresent=${!!html} htmlLength=${html ? html.length : 0} containsHeader=${rawContainsHeader(html || '')} finalHtmlLength=${finalHtml ? finalHtml.length : 0}`);
  } catch (dbgErr) { console.warn('sendRawEmail debug log error', dbgErr); }

  const plain = text || (finalHtml ? finalHtml.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ') : '');

  // Read inline image as base64
  let imageBase64 = '';
  try {
    const logoPath = path.join(process.cwd(), 'public', 'brasao-BM.png');
    if (fs.existsSync(logoPath)) imageBase64 = fs.readFileSync(logoPath).toString('base64');
  } catch (e) { console.warn('logo read error (raw):', e); }

  const boundaryRelated = `----=_Related_${Date.now()}`;
  const boundaryAlt = `----=_Alt_${Date.now()}`;

  const encodeSubject = (s: string) => `=?UTF-8?B?${Buffer.from(s || '', 'utf8').toString('base64')}?=`;
  const subj = encodeSubject(subject || '');

  const rawLines: string[] = [];
  rawLines.push(`From: ${fromAddress}`);
  rawLines.push(`To: ${to}`);
  rawLines.push(`Subject: ${subj}`);
  rawLines.push('MIME-Version: 1.0');
  rawLines.push(`Content-Type: multipart/related; boundary="${boundaryRelated}"`);
  rawLines.push('');

  rawLines.push(`--${boundaryRelated}`);
  rawLines.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
  rawLines.push('');

  rawLines.push(`--${boundaryAlt}`);
  rawLines.push('Content-Type: text/plain; charset="utf-8"');
  rawLines.push('Content-Transfer-Encoding: base64');
  rawLines.push('');
  rawLines.push(Buffer.from(plain || '', 'utf8').toString('base64'));
  rawLines.push('');

  rawLines.push(`--${boundaryAlt}`);
  rawLines.push('Content-Type: text/html; charset="utf-8"');
  rawLines.push('Content-Transfer-Encoding: base64');
  rawLines.push('');
  rawLines.push(Buffer.from(finalHtml || '', 'utf8').toString('base64'));
  rawLines.push('');

  rawLines.push(`--${boundaryAlt}--`);
  rawLines.push('');

  if (imageBase64) {
    rawLines.push(`--${boundaryRelated}`);
    rawLines.push('Content-Type: image/png; name="brasao-BM.png"');
    rawLines.push('Content-Transfer-Encoding: base64');
    rawLines.push('Content-ID: <brasao_bm>');
    rawLines.push('Content-Disposition: inline; filename="brasao-BM.png"');
    rawLines.push('');
    rawLines.push(imageBase64);
    rawLines.push('');
  }

  rawLines.push(`--${boundaryRelated}--`);
  rawLines.push('');

  const rawMessage = rawLines.join('\r\n');

  try {
    const rawDbg = `raw email: to=${to} htmlPresent=${!!html} containsHeader=${rawContainsHeader(html || '')} rawSize=${rawMessage.length}`;
    console.log(rawDbg);
    appendDebugLog(rawDbg);
    const info = await transporter.sendMail({ envelope: { from: fromAddress, to }, raw: rawMessage });
    console.log(`Raw email sent to ${to} (id=${(info as any)?.messageId})`);
    appendDebugLog(`Raw email sent to ${to} id=${(info as any)?.messageId}`);
    return info;
  } catch (err) {
    console.error('Error sending raw email:', err);
    appendDebugLog(`Raw send error to=${to} err=${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
};

// Cron job to check for reminders every hour
cron.schedule("0 * * * *", async () => {
  console.log("Checking for upcoming appointments...");
  const data = getData();
  const now = new Date();
  const reminderTime = new Date(now.getTime() + data.settings.reminderHoursBefore * 60 * 60 * 1000);

  data.appointments.forEach(async (app: any) => {
    const appDate = new Date(`${app.date}T${app.time}`);
    
    // If appointment is within the reminder window and hasn't been reminded yet
    if (appDate > now && appDate <= reminderTime && !app.reminderSent) {
      const patient = data.patients.find((p: any) => p.id === app.patientId);
      const dentist = data.dentists.find((d: any) => d.id === app.dentistId);

      if (patient && dentist) {
        const message = `Lembrete: Você tem uma consulta odontológica com ${dentist.name} em ${app.date} às ${app.time}.`;

        if (data.settings.emailReminders && patient.email) {
          const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
          // Enviar apenas o corpo: o servidor adicionará o cabeçalho (logo CID + texto Diretoria de Saúde / Bravo Odonto)
          const html = `
            <div style="font-family:Arial,sans-serif;color:#111;padding:0 12px">
              <p>Olá ${patient.name},</p>
              <p>Lembrete: Você tem uma consulta odontológica com <strong>${dentist.name}</strong> em ${app.date} às ${app.time}.</p>
              <p style="text-align:center;margin:18px 0"><a href="${siteUrl}" style="display:inline-block;padding:12px 18px;background:#10B981;color:#fff;border-radius:6px;text-decoration:none">Acessar Portal</a></p>
              <hr />
              <p style="font-size:12px;color:#666">Este é um e-mail automático do Bravo Odonto.</p>
            </div>
          `;

          await sendEmail(patient.email, "Lembrete de Consulta", message, html);
        }

        // Mark as sent
        app.reminderSent = true;
      }
    }
  });

  saveData(data);
});

// Gemini AI endpoint - a chave fica exclusivamente no servidor
app.post("/api/ai/generate", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor" });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: "Campo 'prompt' é obrigatório" });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || "Erro na API do Gemini" });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.json({ text });
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    res.status(500).json({ error: "Erro interno ao processar solicitação de IA" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const provider = (process.env.SMTP_PROVIDER || 'gmail').toLowerCase();
    console.log(`Email provider configured: ${provider}`);
  });
}

startServer();
