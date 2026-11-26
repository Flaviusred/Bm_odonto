/**
 * Cria usuários e dados de TESTE no Firebase Emulator.
 *
 * Só roda com o emulador ativo (npm run dev:emulador). Se as variáveis do emulador
 * não estiverem definidas, o script aborta — ele nunca escreve na produção.
 *
 * É idempotente: pode rodar várias vezes sem duplicar dados.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';


const PROJECT_ID = 'demo-bm-odonto';
const PASSWORD = 'teste123';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('ABORTADO: o emulador não está ativo. Use "npm run dev:emulador".');
  process.exit(1);
}

// Ignora credenciais reais da máquina (ex.: GOOGLE_APPLICATION_CREDENTIALS apontando para a
// service account de produção): o emulador não precisa delas.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const clientConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
const databaseId = String(clientConfig.firestoreDatabaseId || '').trim();

const app = initializeApp({ projectId: PROJECT_ID }, 'seed-emulator');
const auth = getAuth(app);
const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

const now = new Date().toISOString();

const people = [
  { uid: 'teste-admin', name: 'Admin Teste', email: 'admin@teste.local', role: 'admin', cpf: '52998224725' },
  { uid: 'teste-atendente', name: 'Atendente Teste', email: 'atendente@teste.local', role: 'attendant', cpf: '11144477735' },
  { uid: 'teste-dentista', name: 'Dentista Teste', email: 'dentista@teste.local', role: 'dentist', cpf: '98765432100' },
  { uid: 'teste-paciente', name: 'Paciente Teste', email: 'paciente@teste.local', role: 'patient', cpf: '12345678909' },
] as const;

const ensureAuthUser = async (p: (typeof people)[number]) => {
  try {
    await auth.getUser(p.uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
    await auth.createUser({ uid: p.uid, email: p.email, password: PASSWORD, displayName: p.name, emailVerified: true });
  }
};

const main = async () => {
  for (const p of people) {
    await ensureAuthUser(p);
    await db.collection('users').doc(p.uid).set({
      id: p.uid,
      authUid: p.uid,
      name: p.name,
      email: p.email,
      cpf: p.cpf,
      phone: '(83) 99999-0000',
      role: p.role,
      permissions: [],
    }, { merge: true });
  }

  await db.collection('attendants').doc('teste-atendente').set({
    id: 'teste-atendente', authUid: 'teste-atendente', name: 'Atendente Teste', email: 'atendente@teste.local',
    phone: '(83) 99999-0000', createdAt: now, isActive: true,
  }, { merge: true });

  await db.collection('dentists').doc('teste-dentista').set({
    id: 'teste-dentista', authUid: 'teste-dentista', name: 'Dentista Teste', email: 'dentista@teste.local',
    phone: '(83) 99999-0000', specialty: 'Geral', cro: '12345', cpf: '98765432100', createdAt: now, isActive: true,
  }, { merge: true });

  await db.collection('patients').doc('teste-paciente').set({
    id: 'teste-paciente', authUid: 'teste-paciente', name: 'Paciente Teste', email: 'paciente@teste.local',
    phone: '(83) 99999-0000', cpf: '12345678909', birthDate: '1990-01-01', address: 'Rua de Teste, 100',
    createdAt: now, isActive: true, patientType: 'civil',
  }, { merge: true });

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await db.collection('appointments').doc('teste-agendamento').set({
    id: 'teste-agendamento', patientId: 'teste-paciente', dentistId: 'teste-dentista',
    patientAuthUid: 'teste-paciente', dentistAuthUid: 'teste-dentista', patientEmail: 'paciente@teste.local',
    date: tomorrow, time: '09:00', status: 'scheduled', notes: 'Agendamento de teste', createdAt: now,
  }, { merge: true });

  console.log('\nDados de teste prontos no emulador. Logins (senha para todos: ' + PASSWORD + '):');
  for (const p of people) console.log(`  ${p.role.padEnd(10)} ${p.email.padEnd(24)} CPF ${p.cpf}`);
  console.log(`\nApp: http://localhost:3000`);
  console.log(`Dados do Firestore: http://localhost:4000/firestore/${databaseId || 'default'}/data\n`);
};

main().then(() => process.exit(0)).catch((err) => {
  console.error('Falha ao criar dados de teste:', err);
  process.exit(1);
});
