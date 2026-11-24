/**
 * Remove o campo `password` (senha em texto puro) dos documentos do Firestore.
 *
 * A senha de quem tem conta no Firebase Auth fica só lá; a cópia no Firestore não é usada
 * no login e pode ser lida por outros usuários. Este script apaga essas cópias.
 *
 * Segurança:
 * - Por padrão só SIMULA (não altera nada). Para aplicar, use --apply.
 * - Só remove a senha de quem TEM conta no Firebase Auth (por authUid, ID do documento ou e-mail).
 *   Contas antigas sem Firebase Auth são mantidas e listadas, para não perderem o acesso.
 * - Nunca imprime senhas.
 *
 * Uso:
 *   npm run senhas:simular   -> mostra o que seria removido
 *   npm run senhas:aplicar   -> remove de fato
 *
 * Credenciais (produção): FIREBASE_SERVICE_ACCOUNT_PATH=caminho/do/arquivo.json
 * ou FIREBASE_SERVICE_ACCOUNT com o JSON. No modo teste (emulador) não precisa.
 */
import dotenv from 'dotenv';
import adminModule from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const admin: any = (adminModule as any)?.default || adminModule;

dotenv.config();

const APPLY = process.argv.includes('--apply');
const COLLECTIONS = ['users', 'patients', 'dentists', 'attendants'] as const;
const IS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

const clientConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
const databaseId = String(clientConfig.firestoreDatabaseId || '').trim();

const initAdmin = () => {
  if (IS_EMULATOR) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return admin.initializeApp({ projectId: 'demo-bm-odonto' });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || clientConfig.projectId;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH), 'utf-8'));
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId });
  }
  return admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
};

const app = initAdmin();
const auth = app.auth();
const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

const authAccountExists = async (data: any, docId: string) => {
  for (const uid of [data.authUid, docId].filter((v) => typeof v === 'string' && v)) {
    try {
      await auth.getUser(uid);
      return true;
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }
  const email = String(data.email || '').trim().toLowerCase();
  if (email) {
    try {
      await auth.getUserByEmail(email);
      return true;
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }
  return false;
};

const main = async () => {
  console.log(`\n${APPLY ? 'APLICANDO' : 'SIMULAÇÃO (nada será alterado)'} — projeto: ${app.options.projectId}, banco: ${databaseId || '(default)'}${IS_EMULATOR ? ' [EMULADOR]' : ''}\n`);

  let removed = 0;
  const kept: string[] = [];

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.password === undefined) continue;
      const label = `${col}/${doc.id} (${data.email || 'sem e-mail'})`;

      if (await authAccountExists(data, doc.id)) {
        if (APPLY) await doc.ref.update({ password: FieldValue.delete() });
        console.log(`  ${APPLY ? 'removida' : 'seria removida'}: ${label}`);
        removed++;
      } else {
        kept.push(label);
      }
    }
  }

  console.log(`\nTotal ${APPLY ? 'removidas' : 'a remover'}: ${removed}`);
  if (kept.length) {
    console.log(`\nMantidas (${kept.length}) — sem conta no Firebase Auth; o login delas ainda depende desse campo:`);
    kept.forEach((k) => console.log(`  ${k}`));
    console.log('Para essas, peça "Esqueci a senha" ou redefina pelo admin; depois rode o script de novo.');
  }
  if (!APPLY && removed) console.log('\nPara aplicar: npm run senhas:aplicar');
  console.log('');
};

main().then(() => process.exit(0)).catch((err) => {
  console.error('Falha:', err instanceof Error ? err.message : err);
  process.exit(1);
});
