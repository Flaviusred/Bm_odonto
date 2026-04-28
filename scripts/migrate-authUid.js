/*
Script de migração para popular campos `authUid` e converter `userId` de notificações para o UID do Firebase Auth.

Uso:
  # execução apenas de simulação (dry-run, sem gravações)
  node scripts/migrate-authUid.js

  # aplicar mudanças (requer credenciais de serviço)
  GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json" node scripts/migrate-authUid.js --apply

Observações:
- Requer `firebase-admin` (`npm install firebase-admin`).
- O script tenta relacionar documentos `users` do Firestore com usuários do Firebase Auth pelo email.
- Atualiza: `users` (seta `authUid`), `patients` (seta `authUid`), `appointments` (seta `patientAuthUid`/`dentistAuthUid`), `treatments` (seta `patientAuthUid`), `documents` (seta `patientAuthUid`) e `notifications` (altera `userId` para o `authUid` quando possível e salva `prevUserId`).
- Modo seguro (dry-run) apenas lista as alterações planejadas. Use `--apply` para executar as mudanças.
*/

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log('Migração iniciada. Modo APPLY:', APPLY);

  // Lê configuração do projeto (mesmo padrão do server.ts)
  let firebaseClientConfig = {};
  try {
    const configPath = join(__dirname, '..', 'firebase-applet-config.json');
    if (existsSync(configPath)) {
      firebaseClientConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('Aviso: não foi possível ler firebase-applet-config.json:', e);
  }

  const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseClientConfig.projectId || '';
  const baseConfig = {};
  if (FIREBASE_PROJECT_ID) baseConfig.projectId = FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ ...baseConfig, credential: admin.credential.cert(serviceAccount) });
    console.log('Admin SDK inicializado com FIREBASE_SERVICE_ACCOUNT.');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ ...baseConfig, credential: admin.credential.applicationDefault() });
    console.log('Admin SDK inicializado com GOOGLE_APPLICATION_CREDENTIALS (ADC).');
  } else {
    console.error('ERRO: Nenhuma credencial configurada.');
    console.error('Defina FIREBASE_SERVICE_ACCOUNT (JSON da service account) ou GOOGLE_APPLICATION_CREDENTIALS (caminho para arquivo JSON).');
    process.exit(1);
  }

  const db = admin.firestore();

  // Load all users docs from Firestore
  const usersSnap = await db.collection('users').get();
  const usersByAppId = {};
  const emailToAppId = {};
  usersSnap.forEach(doc => {
    const data = doc.data() || {};
    usersByAppId[doc.id] = { id: doc.id, ...data };
    if (data.email) emailToAppId[String(data.email).toLowerCase()] = doc.id;
  });

  console.log('Encontrados', Object.keys(usersByAppId).length, 'documentos `users` no Firestore.');

  // List all Firebase Auth users
  const authUsers = [];
  let nextPageToken = undefined;
  do {
    const res = await admin.auth().listUsers(1000, nextPageToken);
    authUsers.push(...res.users);
    nextPageToken = res.pageToken;
  } while (nextPageToken);

  console.log('Encontrados', authUsers.length, 'usuários no Firebase Auth.');

  // Map auth users by email
  const authByEmail = {};
  authUsers.forEach(u => {
    if (u.email) authByEmail[String(u.email).toLowerCase()] = u;
  });

  // Determine which users need authUid set
  const usersToUpdate = [];
  for (const [appId, u] of Object.entries(usersByAppId)) {
    if (u.authUid) continue;
    const email = u.email && String(u.email).toLowerCase();
    if (!email) continue;
    const authUser = authByEmail[email];
    if (authUser) {
      usersToUpdate.push({ appId, uid: authUser.uid });
    }
  }

  console.log('Usuários para atualizar com authUid:', usersToUpdate.length);
  if (usersToUpdate.length && !APPLY) console.log('Dry-run: nenhuma escrita será executada. Use --apply para aplicar as mudanças.');

  // Apply users updates
  for (const { appId, uid } of usersToUpdate) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `users/${appId} -> authUid=${uid}`);
    if (APPLY) await db.collection('users').doc(appId).update({ authUid: uid });
    // keep local map updated for subsequent steps
    usersByAppId[appId].authUid = uid;
  }

  // Build appId -> authUid map
  const appIdToAuthUid = {};
  for (const [appId, u] of Object.entries(usersByAppId)) {
    if (u.authUid) appIdToAuthUid[appId] = u.authUid;
  }

  // Patients: set authUid based on matching users or email
  const patientsSnap = await db.collection('patients').get();
  console.log('Encontrados', patientsSnap.size, 'pacientes');
  const patientUpdates = [];
  patientsSnap.forEach(doc => {
    const data = doc.data() || {};
    const appId = doc.id;
    let foundUid = data.authUid || appIdToAuthUid[appId];
    if (!foundUid && data.email) {
      const mappedAppId = emailToAppId[String(data.email).toLowerCase()];
      if (mappedAppId && appIdToAuthUid[mappedAppId]) foundUid = appIdToAuthUid[mappedAppId];
    }
    if (foundUid && !data.authUid) {
      patientUpdates.push({ docId: doc.id, authUid: foundUid });
    }
  });

  console.log('Pacientes para atualizar com authUid:', patientUpdates.length);
  for (const u of patientUpdates) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `patients/${u.docId} -> authUid=${u.authUid}`);
    if (APPLY) await db.collection('patients').doc(u.docId).update({ authUid: u.authUid });
  }

  // Appointments: set patientAuthUid and dentistAuthUid
  const apptsSnap = await db.collection('appointments').get();
  console.log('Encontrados', apptsSnap.size, 'agendamentos');
  const apptUpdates = [];
  apptsSnap.forEach(doc => {
    const data = doc.data() || {};
    const patientId = data.patientId;
    const dentistId = data.dentistId;
    const patientAuthUid = data.patientAuthUid || appIdToAuthUid[patientId] || null;
    const dentistAuthUid = data.dentistAuthUid || appIdToAuthUid[dentistId] || null;
    if ((patientAuthUid && data.patientAuthUid !== patientAuthUid) || (dentistAuthUid && data.dentistAuthUid !== dentistAuthUid)) {
      apptUpdates.push({ docId: doc.id, patientAuthUid, dentistAuthUid });
    }
  });

  console.log('Agendamentos para atualizar:', apptUpdates.length);
  for (const u of apptUpdates) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `appointments/${u.docId} -> patientAuthUid=${u.patientAuthUid} dentistAuthUid=${u.dentistAuthUid}`);
    if (APPLY) await db.collection('appointments').doc(u.docId).update({ patientAuthUid: u.patientAuthUid, dentistAuthUid: u.dentistAuthUid });
  }

  // Treatments: set patientAuthUid
  const treatmentsSnap = await db.collection('treatments').get();
  console.log('Encontrados', treatmentsSnap.size, 'tratamentos');
  const treatmentUpdates = [];
  treatmentsSnap.forEach(doc => {
    const data = doc.data() || {};
    const patientId = data.patientId;
    const patientAuthUid = data.patientAuthUid || appIdToAuthUid[patientId] || null;
    if (patientAuthUid && data.patientAuthUid !== patientAuthUid) {
      treatmentUpdates.push({ docId: doc.id, patientAuthUid });
    }
  });

  console.log('Tratamentos para atualizar:', treatmentUpdates.length);
  for (const u of treatmentUpdates) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `treatments/${u.docId} -> patientAuthUid=${u.patientAuthUid}`);
    if (APPLY) await db.collection('treatments').doc(u.docId).update({ patientAuthUid: u.patientAuthUid });
  }

  // Documents: set patientAuthUid
  const docsSnap = await db.collection('documents').get();
  console.log('Encontrados', docsSnap.size, 'documentos (arquivos)');
  const docUpdates = [];
  docsSnap.forEach(doc => {
    const data = doc.data() || {};
    const patientId = data.patientId;
    const patientAuthUid = data.patientAuthUid || appIdToAuthUid[patientId] || null;
    if (patientAuthUid && data.patientAuthUid !== patientAuthUid) {
      docUpdates.push({ docId: doc.id, patientAuthUid });
    }
  });

  console.log('Documentos de pacientes para atualizar:', docUpdates.length);
  for (const u of docUpdates) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `documents/${u.docId} -> patientAuthUid=${u.patientAuthUid}`);
    if (APPLY) await db.collection('documents').doc(u.docId).update({ patientAuthUid: u.patientAuthUid });
  }

  // Notifications: convert userId (app user id) -> authUid when possible
  const notifsSnap = await db.collection('notifications').get();
  console.log('Encontradas', notifsSnap.size, 'notificações');
  const notifUpdates = [];
  notifsSnap.forEach(doc => {
    const data = doc.data() || {};
    const existingUserId = data.userId;
    if (!existingUserId) return;
    const mappedUid = appIdToAuthUid[existingUserId];
    if (mappedUid && mappedUid !== existingUserId) {
      notifUpdates.push({ docId: doc.id, from: existingUserId, to: mappedUid });
    }
  });

  console.log('Notificações para reatribuir `userId` para authUid:', notifUpdates.length);
  for (const u of notifUpdates) {
    console.log((APPLY ? 'Atualizando' : 'Iria atualizar'), `notifications/${u.docId} -> userId=${u.to} (antes ${u.from})`);
    if (APPLY) await db.collection('notifications').doc(u.docId).update({ userId: u.to, prevUserId: u.from });
  }

  console.log('Migração concluída.');
}

main().catch(err => {
  console.error('Migração falhou:', err);
  process.exit(1);
});
