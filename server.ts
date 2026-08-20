import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import adminModule from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
// Some environments/packagers expose firebase-admin as a default export,
// others as the module namespace. Normalize to `admin` variable.
const admin: any = (adminModule as any)?.default || adminModule;
import { google } from "googleapis";

dotenv.config();

const localEnvPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

// Lê configurações do Firebase client config para reutilizar projectId e databaseId no Admin SDK
let firebaseClientConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseClientConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Failed to read firebase-applet-config.json:', e);
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseClientConfig.projectId || '';
const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID || ((): string => {
  const id = (firebaseClientConfig.firestoreDatabaseId || '').trim();
  return (id && id !== '(default)') ? id : '';
})();

// Initialize Firebase Admin SDK (server-side)
try {
  const apps = (admin && admin.apps) ? admin.apps : [];
  if (apps.length === 0) {
    const baseConfig: any = {};
    if (FIREBASE_PROJECT_ID) baseConfig.projectId = FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ ...baseConfig, credential: admin.credential.cert(serviceAccount as any) });
    } else {
      // Sem service account: tenta ADC com projectId explícito.
      // No Render, adicione a variável FIREBASE_SERVICE_ACCOUNT com o JSON da service account.
      console.warn('FIREBASE_SERVICE_ACCOUNT não configurado — Admin SDK usando ADC. Configure no painel do Render para funcionar corretamente.');
      admin.initializeApp(baseConfig);
    }
  }
} catch (e) {
  console.warn('Firebase admin init warning:', e);
}

let db: any = null;
try {
  let adminApp: any = null;
  if (admin && admin.apps && admin.apps.length > 0) adminApp = admin.app();
  if (adminApp) {
    // Usa named database quando disponível (mesma database do client SDK)
    if (FIREBASE_DATABASE_ID) {
      try {
        db = getFirestore(adminApp, FIREBASE_DATABASE_ID);
        console.log(`Firestore admin conectado ao database: ${FIREBASE_DATABASE_ID}`);
      } catch (namedDbErr) {
        console.warn('getFirestore com named database falhou, tentando default:', namedDbErr);
        db = adminApp.firestore ? adminApp.firestore() : null;
      }
    } else {
      db = adminApp.firestore ? adminApp.firestore() : null;
    }
  } else if (admin && typeof admin.firestore === 'function') {
    db = admin.firestore();
  }
} catch (e) {
  console.warn('Failed to initialize Firestore instance:', e);
}

if (!db) {
  console.warn('Firestore not initialized. Firestore-dependent endpoints will fail until configured.');
} else {
  console.log(`Firebase Admin SDK inicializado. Project: ${FIREBASE_PROJECT_ID || '(desconhecido)'}, Database: ${FIREBASE_DATABASE_ID || '(default)'}`);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(process.cwd(), "data.json");

// Middleware: verifica Firebase ID Token no header Authorization (Bearer <token>)
const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    req.firebaseUser = await admin.auth().verifyIdToken(idToken);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const getRoleForFirebaseUid = async (firebaseUid: string): Promise<string | null> => {
  if (!db || typeof db.collection !== 'function') return null;

  try {
    const directSnap = await db.collection('users').doc(firebaseUid).get();
    if (directSnap.exists) {
      const data = directSnap.data() || {};
      return String((data as any).role || '').trim() || null;
    }

    const byAuthUidSnap = await db.collection('users').where('authUid', '==', firebaseUid).limit(1).get();
    if (!byAuthUidSnap.empty) {
      const doc = byAuthUidSnap.docs[0];
      const data = doc.data() || {};
      return String((data as any).role || '').trim() || null;
    }

    return null;
  } catch (err) {
    console.warn('getRoleForFirebaseUid warning:', err instanceof Error ? err.message : String(err));
    return null;
  }
};

// Simple file-based debug logger for email flows (helps capture logs when
// server output isn't visible in the terminal session)
const DEBUG_LOG_DIR = path.join(process.cwd(), 'tmp');
const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, 'email-debug.log');
try { if (!fs.existsSync(DEBUG_LOG_DIR)) fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true }); } catch (e) {}
const appendDebugLog = (line: string) => {
  try { fs.appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${line}\n`); } catch (e) { /* ignore */ }
};

// Monitor events (email sends, cbmpb requests). Attempts to write to Firestore
// collection `monitoring`. Falls back to the debug log file if Firestore isn't
// available or on errors.
const monitorEvent = async (type: string, details: any) => {
  const evt = { type, details: details || {}, ts: new Date().toISOString() };
  try {
    appendDebugLog(`monitorEvent: ${JSON.stringify(evt)}`);
  } catch (e) { /* ignore */ }

  try {
    if (db && typeof db.collection === 'function') {
      try {
        await db.collection('monitoring').add(evt);
      } catch (err) {
        appendDebugLog(`monitorEvent firestore add failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (e) {
    try { appendDebugLog(`monitorEvent failed: ${e instanceof Error ? e.message : String(e)}`); } catch (e2) {}
  }
};

app.use(express.json({ limit: '50mb' }));

// Some reverse proxies may forward duplicated slashes (e.g. //api/...)
// which prevents Express routes from matching. Normalize the URL path first.
app.use((req: any, _res: any, next: any) => {
  const [rawPath, ...rawQuery] = String(req.url || '/').split('?');
  const normalizedPath = rawPath.replace(/\/+/g, '/');
  if (normalizedPath !== rawPath) {
    req.url = normalizedPath + (rawQuery.length ? `?${rawQuery.join('?')}` : '');
  }
  next();
});

// CORS: permite que o Firebase Hosting (ou qualquer origem configurada em CORS_ORIGINS)
// acesse as rotas /api/**. Em desenvolvimento, libera localhost.
app.use((req: any, res: any, next: any) => {
  const rawOrigins = process.env.CORS_ORIGINS || '';
  const allowed = rawOrigins
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);
  // Sempre libera localhost em qualquer porta (desenvolvimento)
  const origin: string = req.headers.origin || '';
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
  if (isLocalhost || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Strip /bravoOdonto prefix when the external proxy forwards requests with the subpath intact
// (e.g. reverse proxy sends /bravoOdonto/api/... directly to Node.js on port 3000)
app.use((req: any, _res: any, next: any) => {
  if (req.url.startsWith('/bravoOdonto/')) {
    req.url = req.url.slice('/bravoOdonto'.length);
  } else if (req.url === '/bravoOdonto') {
    req.url = '/';
  }
  next();
});

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
    const docRef = db.collection(col).doc(userId);
    let wroteToFirestore = false;

    try {
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.set({ googleTokens: tokens }, { merge: true });
        wroteToFirestore = true;
      } else {
        // If the domain document does not exist, attempt to enrich with Firebase Auth info
        // to avoid creating a blank dentist/patient doc that shows up empty in the UI.
        try {
          const adminUser = admin && admin.auth ? await admin.auth().getUser(userId) : null;
          const name = adminUser?.displayName || '';
          const email = adminUser?.email || '';
          if (name || email) {
            await docRef.set({ googleTokens: tokens, name, email }, { merge: true });
            wroteToFirestore = true;
          } else {
            // Do not create a minimal/empty doc — skip storing tokens to avoid blank UI entries
            console.warn(`Skipping creation of empty ${col} document for user ${userId} when saving google tokens.`);
          }
        } catch (e) {
          console.warn('Failed to lookup admin user to enrich new doc, skipping creation of empty doc', e);
        }
      }
    } catch (e) {
      console.warn('Failed while checking/setting Firestore doc for google tokens', e);
    }

    // Also keep local data.json in sync when present (backwards compatibility)
    try {
      if (!wroteToFirestore) return; // nothing to persist locally if we didn't create/update Firestore
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

const normalizeCpf = (value: unknown) => String(value || '').replace(/\D/g, '');

const uniqueNonEmptyStrings = (values: unknown[]) => Array.from(new Set(
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));

const findPasswordResetTarget = async (email: string, cpf: string) => {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('Firestore indisponível no servidor.');
  }

  const emailCandidates = uniqueNonEmptyStrings([email, email.toLowerCase()]);
  const userMatches = new Map<string, any>();

  for (const candidate of emailCandidates) {
    const userSnap = await db.collection('users').where('email', '==', candidate).get();
    userSnap.forEach((item: any) => {
      userMatches.set(item.id, item);
    });
  }

  for (const item of userMatches.values()) {
    const data = item.data() || {};
    if (normalizeCpf(data.cpf) !== cpf) continue;
    return {
      id: item.id,
      authUid: data.authUid || item.id,
      email: String(data.email || email).trim().toLowerCase(),
      name: String(data.name || '').trim(),
    };
  }

  const patientMatches = new Map<string, any>();

  for (const candidate of emailCandidates) {
    const patientSnap = await db.collection('patients').where('email', '==', candidate).get();
    patientSnap.forEach((item: any) => {
      patientMatches.set(item.id, item);
    });
  }

  for (const item of patientMatches.values()) {
    const data = item.data() || {};
    if (normalizeCpf(data.cpf) !== cpf) continue;

    const possibleUserIds = uniqueNonEmptyStrings([item.id, data.authUid]);
    for (const userId of possibleUserIds) {
      const userSnap = await db.collection('users').doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        return {
          id: userSnap.id,
          authUid: userData.authUid || data.authUid || userSnap.id,
          email: String(userData.email || data.email || email).trim().toLowerCase(),
          name: String(userData.name || data.name || '').trim(),
        };
      }
    }

    return {
      id: item.id,
      authUid: data.authUid || item.id,
      email: String(data.email || email).trim().toLowerCase(),
      name: String(data.name || '').trim(),
    };
  }

  return null;
};

const updatePasswordMirrorIfExists = async (collectionName: 'patients' | 'dentists' | 'attendants', userId: string, newPassword: string) => {
  try {
    const ref = db.collection(collectionName).doc(userId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({ password: newPassword });
    }
  } catch (err) {
    console.warn(`Falha ao atualizar senha espelhada em ${collectionName}/${userId}:`, err);
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

    const allowedOrigin = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
    res.send(`
      <html>
        <body>
          <script>
            var allowed = ${JSON.stringify(allowedOrigin)};
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, allowed);
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
app.post('/api/google/insert-test-event', requireAuth, async (req: any, res: any) => {
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

app.put("/api/users/:id", requireAuth, (req: any, res: any) => {
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

app.post('/api/admin/users/:id/password', requireAuth, async (req: any, res: any) => {
  const targetUserId = String(req.params?.id || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const targetEmail = String(req.body?.email || '').trim().toLowerCase();
  const previousEmail = String(req.body?.previousEmail || '').trim().toLowerCase();
  const requesterUid = String(req.firebaseUser?.uid || '').trim();

  if (!targetUserId || !newPassword) {
    return res.status(400).json({ error: 'id e newPassword são obrigatórios' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(500).json({ error: 'Firestore indisponível no servidor.' });
  }

  try {
    const requesterRole = await getRoleForFirebaseUid(requesterUid);
    if (requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem alterar senha de outros usuários.' });
    }

    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserSnap = await targetUserRef.get();
    const targetUserData = targetUserSnap.exists ? (targetUserSnap.data() || {}) : {};

    const emailCandidates = uniqueNonEmptyStrings([
      targetEmail,
      previousEmail,
      (targetUserData as any).email,
    ].map((value) => String(value || '').trim().toLowerCase()));

    const authUidCandidates = uniqueNonEmptyStrings([
      (targetUserData as any).authUid,
      targetUserId,
      req.body?.authUid,
    ]);

    const collectCandidatesFromDoc = (snap: any) => {
      if (!snap || !snap.exists) return;
      const data = snap.data() || {};
      authUidCandidates.push(String((data as any).authUid || ''));
      emailCandidates.push(String((data as any).email || '').trim().toLowerCase());
    };

    const directCollections: Array<'users' | 'patients' | 'dentists' | 'attendants'> = ['users', 'patients', 'dentists', 'attendants'];
    for (const collectionName of directCollections) {
      const snap = await db.collection(collectionName).doc(targetUserId).get();
      collectCandidatesFromDoc(snap);
    }

    const usersByAuthUidSnap = await db.collection('users').where('authUid', '==', targetUserId).limit(1).get();
    usersByAuthUidSnap.forEach((item: any) => collectCandidatesFromDoc(item));

    for (const candidateEmail of uniqueNonEmptyStrings(emailCandidates)) {
      const collectionsByEmail: Array<'users' | 'patients' | 'dentists' | 'attendants'> = ['users', 'patients', 'dentists', 'attendants'];
      for (const collectionName of collectionsByEmail) {
        const snapByEmail = await db.collection(collectionName).where('email', '==', candidateEmail).limit(2).get();
        snapByEmail.forEach((item: any) => collectCandidatesFromDoc(item));
      }
    }

    for (const candidateEmail of uniqueNonEmptyStrings(emailCandidates)) {
      try {
        const byEmail = await admin.auth().getUserByEmail(candidateEmail);
        if (byEmail?.uid) authUidCandidates.push(byEmail.uid);
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
      }
    }

    let updatedAuthUid: string | null = null;
    for (const authUid of uniqueNonEmptyStrings(authUidCandidates)) {
      try {
        await admin.auth().updateUser(authUid, { password: newPassword });
        updatedAuthUid = authUid;
        break;
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') continue;
        throw authErr;
      }
    }

    if (!updatedAuthUid) {
      const createEmail = uniqueNonEmptyStrings(emailCandidates)[0];
      if (!createEmail) {
        return res.status(404).json({ error: 'Usuário de autenticação não encontrado para atualização de senha.' });
      }

      try {
        const created = await admin.auth().createUser({
          email: createEmail,
          password: newPassword,
        });
        updatedAuthUid = created.uid;
      } catch (createErr: any) {
        if (createErr?.code === 'auth/email-already-exists') {
          const existing = await admin.auth().getUserByEmail(createEmail);
          await admin.auth().updateUser(existing.uid, { password: newPassword });
          updatedAuthUid = existing.uid;
        } else {
          throw createErr;
        }
      }
    }

    await targetUserRef.set({
      authUid: updatedAuthUid,
      password: newPassword,
      passwordResetToken: '',
      passwordResetExpires: null,
    }, { merge: true });

    await updatePasswordMirrorIfExists('patients', targetUserId, newPassword);
    await updatePasswordMirrorIfExists('dentists', targetUserId, newPassword);
    await updatePasswordMirrorIfExists('attendants', targetUserId, newPassword);

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('/api/admin/users/:id/password error:', err);
    return res.status(500).json({ error: 'Falha ao atualizar senha no Auth.', details: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/admin/users/:id/email', requireAuth, async (req: any, res: any) => {
  const targetUserId = String(req.params?.id || '').trim();
  const newEmail = String(req.body?.newEmail || '').trim().toLowerCase();
  const previousEmail = String(req.body?.previousEmail || '').trim().toLowerCase();
  const requesterUid = String(req.firebaseUser?.uid || '').trim();

  if (!targetUserId || !newEmail) {
    return res.status(400).json({ error: 'id e newEmail são obrigatórios' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(500).json({ error: 'Firestore indisponível no servidor.' });
  }

  try {
    const requesterRole = await getRoleForFirebaseUid(requesterUid);

    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserSnap = await targetUserRef.get();
    const targetUserData = targetUserSnap.exists ? (targetUserSnap.data() || {}) : {};

    const emailCandidates = uniqueNonEmptyStrings([
      newEmail,
      previousEmail,
      (targetUserData as any).email,
    ].map((value) => String(value || '').trim().toLowerCase()));

    const authUidCandidates = uniqueNonEmptyStrings([
      (targetUserData as any).authUid,
      targetUserId,
      req.body?.authUid,
    ]);

    const collectCandidatesFromDoc = (snap: any) => {
      if (!snap || !snap.exists) return;
      const data = snap.data() || {};
      authUidCandidates.push(String((data as any).authUid || ''));
      emailCandidates.push(String((data as any).email || '').trim().toLowerCase());
    };

    const directCollections: Array<'users' | 'patients' | 'dentists' | 'attendants'> = ['users', 'patients', 'dentists', 'attendants'];
    for (const collectionName of directCollections) {
      const snap = await db.collection(collectionName).doc(targetUserId).get();
      collectCandidatesFromDoc(snap);
    }

    const usersByAuthUidSnap = await db.collection('users').where('authUid', '==', targetUserId).limit(1).get();
    usersByAuthUidSnap.forEach((item: any) => collectCandidatesFromDoc(item));

    for (const candidateEmail of uniqueNonEmptyStrings(emailCandidates)) {
      const collectionsByEmail: Array<'users' | 'patients' | 'dentists' | 'attendants'> = ['users', 'patients', 'dentists', 'attendants'];
      for (const collectionName of collectionsByEmail) {
        const snapByEmail = await db.collection(collectionName).where('email', '==', candidateEmail).limit(2).get();
        snapByEmail.forEach((item: any) => collectCandidatesFromDoc(item));
      }
    }

    for (const candidateEmail of uniqueNonEmptyStrings(emailCandidates)) {
      try {
        const byEmail = await admin.auth().getUserByEmail(candidateEmail);
        if (byEmail?.uid) authUidCandidates.push(byEmail.uid);
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
      }
    }

    let targetAuthUid: string | null = null;
    for (const authUid of uniqueNonEmptyStrings(authUidCandidates)) {
      try {
        await admin.auth().getUser(authUid);
        targetAuthUid = authUid;
        break;
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') continue;
        throw authErr;
      }
    }

    if (!targetAuthUid) {
      return res.status(404).json({ error: 'Usuário de autenticação não encontrado para atualização de e-mail.' });
    }

    const canManage = requesterRole === 'admin' || requesterUid === targetAuthUid;
    if (!canManage) {
      return res.status(403).json({ error: 'Sem permissão para atualizar este e-mail.' });
    }

    try {
      await admin.auth().updateUser(targetAuthUid, { email: newEmail });
    } catch (authErr: any) {
      if (authErr?.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: 'Já existe uma conta de autenticação com este e-mail.' });
      }
      throw authErr;
    }

    await targetUserRef.set({ email: newEmail, authUid: targetAuthUid }, { merge: true });

    const mirrorCollections: Array<'patients' | 'dentists' | 'attendants'> = ['patients', 'dentists', 'attendants'];
    for (const collectionName of mirrorCollections) {
      const mirrorRef = db.collection(collectionName).doc(targetUserId);
      const mirrorSnap = await mirrorRef.get();
      if (mirrorSnap.exists) {
        await mirrorRef.set({ email: newEmail, authUid: targetAuthUid }, { merge: true });
      }
    }

    return res.json({ status: 'ok', authUid: targetAuthUid });
  } catch (err) {
    console.error('/api/admin/users/:id/email error:', err);
    return res.status(500).json({ error: 'Falha ao atualizar e-mail no Auth.', details: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/admin/auth/create-user', requireAuth, async (req: any, res: any) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const requesterUid = String(req.firebaseUser?.uid || '').trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    const requesterRole = await getRoleForFirebaseUid(requesterUid);
    if (!requesterRole) {
      return res.status(503).json({ error: 'AUTH_BACKEND_UNAVAILABLE', details: 'Nao foi possivel validar permissao admin no ambiente atual.' });
    }
    if (requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem criar usuários.' });
    }

    try {
      const existing = await admin.auth().getUserByEmail(email);
      return res.status(409).json({ error: 'Ja existe uma conta de autenticacao com este e-mail.', code: 'auth/email-already-exists', uid: existing.uid });
    } catch (existingErr: any) {
      if (existingErr?.code !== 'auth/user-not-found') throw existingErr;
    }

    const created = await admin.auth().createUser({ email, password });
    return res.json({ status: 'ok', uid: created.uid });
  } catch (err) {
    console.error('/api/admin/auth/create-user error:', err);
    return res.status(500).json({ error: 'Falha ao criar usuário no Auth.', details: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/admin/users/create', requireAuth, async (req: any, res: any) => {
  const requesterUid = String(req.firebaseUser?.uid || '').trim();
  const requesterEmail = String(req.firebaseUser?.email || '').trim().toLowerCase();
  const bootstrapAdminEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@odonto.com').trim().toLowerCase();

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const cpf = normalizeCpf(req.body?.cpf);
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || '').trim();
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions.filter((p: any) => typeof p === 'string') : [];
  const specialty = String(req.body?.specialty || '').trim();
  const cro = String(req.body?.cro || '').trim();

  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'Firestore indisponível no servidor.' });
  }
  if (!name || !email || !password || !role || !cpf) {
    return res.status(400).json({ error: 'name, email, cpf, password e role são obrigatórios.' });
  }
  if (cpf.length !== 11) {
    return res.status(400).json({ error: 'CPF inválido. Informe os 11 dígitos.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (!['admin', 'attendant', 'dentist'].includes(role)) {
    return res.status(400).json({ error: 'role inválido para criação administrativa.' });
  }

  try {
    const requesterRole = await getRoleForFirebaseUid(requesterUid);
    const canManageUsers = requesterRole === 'admin' || requesterRole === 'attendant' || (!!bootstrapAdminEmail && requesterEmail === bootstrapAdminEmail);
    if (!canManageUsers) {
      return res.status(403).json({ error: 'Sem permissão para criar usuários.' });
    }

    let authUid = '';
    let usedLegacyAuthFallback = false;
    const isAuthBackendUnavailable = (err: any) => {
      const code = String(err?.code || '');
      const msg = String(err?.message || '').toLowerCase();
      return (
        code === 'app/invalid-credential'
        || code === 'app/no-app'
        || msg.includes('could not load the default credentials')
        || msg.includes('default firebase app does not exist')
      );
    };
    try {
      const created = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });
      authUid = created.uid;
    } catch (authErr: any) {
      if (authErr?.code === 'auth/email-already-exists') {
        const existing = await admin.auth().getUserByEmail(email);
        authUid = existing.uid;
        await admin.auth().updateUser(existing.uid, { password, displayName: name }).catch(() => {});
      } else if (isAuthBackendUnavailable(authErr)) {
        usedLegacyAuthFallback = true;
        authUid = randomUUID().replace(/-/g, '').substring(0, 28);
      } else {
        throw authErr;
      }
    }

    const userDoc: any = {
      id: authUid,
      name,
      email,
      cpf,
      role,
      permissions,
      phone,
      ...(usedLegacyAuthFallback ? { legacyAuth: true, password } : { authUid }),
    };
    await db.collection('users').doc(authUid).set(userDoc, { merge: true });

    let attendantDoc: any = null;
    let dentistDoc: any = null;

    if (role === 'attendant') {
      attendantDoc = {
        id: authUid,
        name,
        email,
        phone,
        createdAt: new Date().toISOString(),
        isActive: true,
        ...(usedLegacyAuthFallback ? { legacyAuth: true, password } : { authUid }),
      };
      await db.collection('attendants').doc(authUid).set(attendantDoc, { merge: true });
    }

    if (role === 'dentist') {
      dentistDoc = {
        id: authUid,
        name,
        email,
        phone,
        specialty: specialty || 'Geral',
        cro: cro || '00000',
        createdAt: new Date().toISOString(),
        isActive: true,
        ...(usedLegacyAuthFallback ? { legacyAuth: true, password } : { authUid }),
      };
      await db.collection('dentists').doc(authUid).set(dentistDoc, { merge: true });
    }

    return res.json({ status: 'ok', legacyAuth: usedLegacyAuthFallback, user: userDoc, attendant: attendantDoc, dentist: dentistDoc });
  } catch (err) {
    console.error('/api/admin/users/create error:', err);
    return res.status(500).json({ error: 'Falha ao criar usuário administrativo.', details: err instanceof Error ? err.message : String(err) });
  }
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

app.post('/api/forgot-password', async (req, res) => {
  const { email, cpf, name, resetLink, origin } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCpf = normalizeCpf(cpf);

  console.log(`/api/forgot-password -> email=${normalizedEmail}`);
  appendDebugLog(`/api/forgot-password -> email=${normalizedEmail}`);

  if (!normalizedEmail || !normalizedCpf) {
    return res.status(400).json({ error: 'email e cpf são obrigatórios' });
  }

  try {
    const targetUser = await findPasswordResetTarget(normalizedEmail, normalizedCpf);
    if (!targetUser) {
      appendDebugLog(`/api/forgot-password: nenhuma conta compatível para ${normalizedEmail}`);
      return res.json({ status: 'ok' });
    }

    const token = randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000;

    // Resolve a front-end base URL preserving deployment subpaths (e.g. /bravoOdonto/).
    const appBasePath = String(process.env.APP_BASE_PATH || '/').trim();
    const normalizedAppBasePath = appBasePath.startsWith('/') ? appBasePath : `/${appBasePath}`;
    const bodyOrigin = String(origin || '').trim();
    const refererHeader = String(req.headers?.referer || '').trim();
    const fallbackOrigin = String(process.env.APP_ORIGIN || `http://localhost:${PORT}`).trim();

    const baseUrl = (() => {
      if (resetLink) return String(resetLink).trim();

      const normalizeBase = (raw: string) => {
        if (!raw) return '';
        try {
          const parsed = new URL(raw);
          const path = (parsed.pathname || '/').replace(/\/+$/, '/');
          const hasSubPath = path !== '/';
          const resolvedPath = hasSubPath ? path : normalizedAppBasePath.replace(/\/+$/, '/') || '/';
          return `${parsed.origin}${resolvedPath}`;
        } catch {
          return '';
        }
      };

      return (
        normalizeBase(refererHeader)
        || normalizeBase(bodyOrigin)
        || normalizeBase(fallbackOrigin)
        || `http://localhost:${PORT}/`
      );
    })();

    const separator = baseUrl.includes('?') ? '&' : '?';
    const link = `${baseUrl.replace(/\/+$/, '')}${separator}resetToken=${encodeURIComponent(token)}&uid=${encodeURIComponent(targetUser.id)}`;

    await db.collection('users').doc(targetUser.id).set({
      authUid: targetUser.authUid,
      email: targetUser.email,
      name: targetUser.name,
      passwordResetToken: token,
      passwordResetExpires: expiresAt,
    }, { merge: true });

    const subject = 'Recuperação de senha - Bravo Odonto';
    const displayName = String(targetUser.name || name || '');
    const text = `Olá ${displayName},\n\nRecebemos uma solicitação para redefinir sua senha. Acesse o link abaixo:\n\n${link}\n\nO link expira em 1 hora. Se não solicitou, ignore este e-mail.`;
    const htmlBody = `
      <p>Olá <strong>${displayName}</strong>,</p>
      <p>Você solicitou a redefinição de senha do seu acesso ao <strong>Bravo Odonto</strong>.</p>
      <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#10B981;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Redefinir Senha</a>
      </p>
      <p style="font-size:12px;color:#666">Se você não solicitou essa alteração, ignore este e-mail.</p>
      <hr/>
      <p style="font-size:12px;color:#666"><strong>Por segurança, não compartilhe este link com ninguém.</strong></p>
    `;
    const info = await sendRawEmail(targetUser.email, subject, text, htmlBody);
    console.log(`/api/forgot-password: e-mail enviado -> messageId=${(info as any)?.messageId}`);
    appendDebugLog(`/api/forgot-password: e-mail enviado -> messageId=${(info as any)?.messageId}`);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('/api/forgot-password error:', err);
    appendDebugLog(`/api/forgot-password error: ${err}`);
    return res.status(500).json({ error: 'Erro ao enviar e-mail de recuperação.', details: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/reset-password/complete', async (req, res) => {
  const uid = String(req.body?.uid || '').trim();
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!uid || !token || !newPassword) {
    return res.status(400).json({ error: 'uid, token e newPassword são obrigatórios' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    if (!db || typeof db.collection !== 'function') {
      throw new Error('Firestore indisponível no servidor.');
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(400).json({ error: 'Token inválido ou usuário não encontrado.' });
    }

    const userData = userSnap.data() || {};
    if (!userData.passwordResetToken || userData.passwordResetToken !== token) {
      return res.status(400).json({ error: 'Token inválido.' });
    }

    if (!userData.passwordResetExpires || userData.passwordResetExpires < Date.now()) {
      return res.status(400).json({ error: 'Token expirado.' });
    }

    const authUidCandidates = uniqueNonEmptyStrings([userData.authUid, uid]);
    for (const authUid of authUidCandidates) {
      try {
        await admin.auth().updateUser(authUid, { password: newPassword });
        break;
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          continue;
        }
        throw authErr;
      }
    }

    await userRef.set({
      password: newPassword,
      passwordResetToken: '',
      passwordResetExpires: null,
    }, { merge: true });

    await updatePasswordMirrorIfExists('patients', uid, newPassword);
    await updatePasswordMirrorIfExists('dentists', uid, newPassword);
    await updatePasswordMirrorIfExists('attendants', uid, newPassword);

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('/api/reset-password/complete error:', err);
    appendDebugLog(`/api/reset-password/complete error: ${err instanceof Error ? err.message : String(err)}`);
    return res.status(500).json({ error: 'Erro ao redefinir a senha.', details: err instanceof Error ? err.message : String(err) });
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
    // CBMPB_BASE_URL deve ser configurado como variável de ambiente com a URL base da API interna
    // Ex: CBMPB_BASE_URL=https://api-interna.cbmpb.pb.gov.br
    // NUNCA deve apontar para o mesmo domínio do app (causaria loop infinito).
    const cbmpbBase = (process.env.CBMPB_BASE_URL || '').replace(/\/$/, '');
    if (!cbmpbBase) {
      console.error("CBMPB_BASE_URL não configurado");
      return res.status(500).json({ error: "URL da API CBMPB não configurada no servidor. Defina CBMPB_BASE_URL." });
    }
    const appOrigin = (process.env.APP_ORIGIN || '').replace(/\/$/, '') || `http://localhost:${PORT}`;
    const url = `${cbmpbBase}/api/v1/pbsaude/servidor/${identifier}`;
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
        'Referer': `${appOrigin}/`,
        'Origin': appOrigin
      }
    });
    
    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    console.log(`Body: ${responseText}`);
    try {
      await monitorEvent('cbmpb_request', { identifier, url, status: response.status, responseLength: responseText ? responseText.length : 0 });
    } catch (monErr) { appendDebugLog(`monitorEvent cbmpb_request failed: ${monErr instanceof Error ? monErr.message : String(monErr)}`); }
    
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
    try { await monitorEvent('cbmpb_error', { identifier, error: error instanceof Error ? error.message : String(error) }); } catch (e) {}
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
  }
});

// Admin endpoint: fetch recent monitoring events (requires auth)
app.get('/api/monitor/recent', requireAuth, async (req, res) => {
  try {
    const type = req.query.type ? String(req.query.type) : null;
    const limit = Number(req.query.limit || 50);

    if (!db) {
      // Fallback: return last lines of debug log file
      try {
        if (!fs.existsSync(DEBUG_LOG_PATH)) return res.json([]);
        const lines = fs.readFileSync(DEBUG_LOG_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
        return res.json(lines.slice(-limit).reverse());
      } catch (e) {
        return res.status(500).json({ error: 'monitoring unavailable', details: e instanceof Error ? e.message : String(e) });
      }
    }

    let ref: any = db.collection('monitoring');
    if (type) ref = ref.where('type', '==', type);
    const snap = await ref.orderBy('ts', 'desc').limit(limit).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data ? d.data() : {}) }));
    res.json(items);
  } catch (err) {
    console.error('/api/monitor/recent error', err);
    res.status(500).json({ error: 'failed to read monitoring events', details: err instanceof Error ? err.message : String(err) });
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
// HTTP-based email via Resend API — bypasses SMTP (Railway, Render, etc. block outbound SMTP)
const sendViaResend = async (from: string, to: string, subject: string, html?: string, text?: string, replyTo?: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const body: Record<string, any> = { from, to: [to], subject };
  if (html) body.html = html;
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(`Resend API error ${res.status}: ${data.message || res.statusText}`);
  console.log(`Email sent via Resend to ${to} (id=${data.id})`);
  return data;
};

// Create a nodemailer transporter based on environment configuration.
const createTransportFromEnv = () => {
  const provider = (process.env.SMTP_PROVIDER || "gmail").toLowerCase();

  // sensible timeouts to avoid long hangs on platforms that block SMTP
  const defaultTimeoutOpts = {
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 20000),
  };

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
        ...defaultTimeoutOpts,
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
        ...defaultTimeoutOpts,
      });
    }

    // Gmail via host explícito para respeitar SMTP_PORT/SMTP_SECURE (service:"gmail" força porta 465)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      ...defaultTimeoutOpts,
    });
  } catch (err) {
    console.error("Error creating transporter:", err);
    throw err;
  }
};

const resolveMailHeaders = () => {
  const provider = (process.env.SMTP_PROVIDER || 'gmail').toLowerCase();
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const configuredFrom = (process.env.EMAIL_FROM || '').trim();

  // Gmail costuma bloquear/spam quando o "from" não pertence à conta autenticada.
  if (provider === 'gmail' && emailUser) {
    return {
      fromAddress: configuredFrom ? `Bravo Odonto <${emailUser}>` : emailUser,
      replyTo: configuredFrom && configuredFrom.toLowerCase() !== emailUser.toLowerCase() ? configuredFrom : undefined,
      provider,
    };
  }

  return {
    fromAddress: configuredFrom || emailUser || `no-reply@${process.env.DOMAIN || 'example.com'}`,
    replyTo: undefined,
    provider,
  };
};

const sendEmail = async (to: string, subject: string, text?: string, html?: string) => {
  // Ensure at least one recipient and some configuration exists
  if (!to) {
    throw new Error("No recipient specified");
  }

  const { fromAddress, replyTo, provider } = resolveMailHeaders();

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

    // Resend HTTP API bypasses SMTP entirely — preferred on cloud platforms
    if (process.env.RESEND_API_KEY) {
      const plainText = text || (finalHtml ? finalHtml.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ') : undefined);
      return sendViaResend(fromAddress, to, subject, finalHtml, plainText, replyTo);
    }

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
    if (replyTo) mailOptions.replyTo = replyTo;

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
    const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted : [];
    const rejected = Array.isArray((info as any)?.rejected) ? (info as any).rejected : [];
    if (accepted.length === 0 || rejected.length > 0) {
      throw new Error(`SMTP accepted=${accepted.length} rejected=${rejected.length}`);
    }
    console.log(`Email sent to ${to} (id=${(info as any).messageId})`);
    try {
      await monitorEvent('email_sent', { to, messageId: (info as any)?.messageId, accepted: (info as any)?.accepted, rejected: (info as any)?.rejected, provider });
    } catch (monErr) {
      console.warn('monitorEvent email_sent failed', monErr);
      try { appendDebugLog(`monitorEvent email_sent failed: ${monErr instanceof Error ? monErr.message : String(monErr)}`); } catch (e) {}
    }
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    try {
      await monitorEvent('email_error', { to, error: error instanceof Error ? error.message : String(error) });
    } catch (monErr) { /* ignore */ }
    throw error;
  }
};

// Support sending raw MIME messages (multipart/related with inline image)
const sendRawEmail = async (to: string, subject: string, text?: string, html?: string) => {
  if (!to) throw new Error('No recipient specified');
  const { fromAddress, replyTo, provider } = resolveMailHeaders();

  let transporter;
  try { transporter = createTransportFromEnv(); } catch (err) { console.error('Transport configuration error (raw):', err); throw err; }

  // Early diagnostics: log whether SMTP credentials are present and verify transporter
  try {
    const hasCredentials = !!(process.env.EMAIL_USER || process.env.SMTP_USER || process.env.SENDGRID_API_KEY);
    console.log(`sendRawEmail: smtpCredsPresent=${hasCredentials} provider=${process.env.SMTP_PROVIDER || 'gmail'}`);
    appendDebugLog(`sendRawEmail: smtpCredsPresent=${hasCredentials} provider=${process.env.SMTP_PROVIDER || 'gmail'}`);
    try {
      await transporter.verify();
      console.log('SMTP verify OK (raw send)');
      appendDebugLog('SMTP verify OK (raw send)');
    } catch (verifyErr) {
      console.error('SMTP verify failed (raw):', verifyErr);
      appendDebugLog(`SMTP verify failed (raw): ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      throw verifyErr;
    }
  } catch (diagErr) {
    // let outer try/catch handle failures
  }

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

  // Resend HTTP API bypasses SMTP entirely — preferred on cloud platforms
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(fromAddress, to, subject, finalHtml, plain, replyTo);
  }

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
    const info = await transporter.sendMail({ envelope: { from: fromAddress, to }, raw: rawMessage, ...(replyTo ? { replyTo } : {}) });
    const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted : [];
    const rejected = Array.isArray((info as any)?.rejected) ? (info as any).rejected : [];
    if (accepted.length === 0 || rejected.length > 0) {
      throw new Error(`SMTP accepted=${accepted.length} rejected=${rejected.length} (raw)`);
    }
    console.log(`Raw email sent to ${to} (id=${(info as any)?.messageId})`);
    appendDebugLog(`Raw email sent to ${to} id=${(info as any)?.messageId}`);
    try {
      await monitorEvent('email_sent', { to, messageId: (info as any)?.messageId, provider, raw: true, accepted: (info as any)?.accepted, rejected: (info as any)?.rejected });
    } catch (monErr) { appendDebugLog(`monitorEvent raw email_sent failed: ${monErr instanceof Error ? monErr.message : String(monErr)}`); }
    return info;
  } catch (err) {
    console.error('Error sending raw email:', err);
    appendDebugLog(`Raw send error to=${to} err=${err instanceof Error ? err.message : String(err)}`);
    try { await monitorEvent('email_error', { to, error: err instanceof Error ? err.message : String(err), raw: true }); } catch (monErr) {}
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
    const indexPath = path.join(distPath, "index.html");

    if (!fs.existsSync(distPath) || !fs.existsSync(indexPath)) {
      const diagnosticMessage =
        "Build de frontend ausente: pasta dist/index.html nao encontrada. Rode 'npm run build' antes de iniciar em producao.";
      console.error(diagnosticMessage);

      app.get("*", (_req, res) => {
        res.status(503).json({
          error: "Frontend build ausente",
          details: diagnosticMessage,
          expectedPath: indexPath,
        });
      });
    } else {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(indexPath);
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const provider = (process.env.SMTP_PROVIDER || 'gmail').toLowerCase();
    console.log(`Email provider configured: ${provider}`);
  });
}

startServer();
