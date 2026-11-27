import dotenv from 'dotenv';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Normaliza import do firebase-admin para ambientes CJS/ESM.

dotenv.config();

const APPLY = process.argv.includes('--apply');
const TARGET_COLLECTIONS = ['users', 'patients', 'dentists', 'attendants'] as const;

type TargetCollection = (typeof TARGET_COLLECTIONS)[number];

function resolveProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return undefined;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId;
  } catch {
    return undefined;
  }
}

function initAdmin() {
  const apps = getApps();
  if (apps.length > 0) return;

  const projectId = resolveProjectId();

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    const raw = fs.readFileSync(path.resolve(serviceAccountPath), 'utf-8');
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount), projectId });
    return;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount), projectId });
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
}

async function findEmptyDocs(db: FirebaseFirestore.Firestore, col: TargetCollection) {
  const snap = await db.collection(col).get();
  const emptyDocIds: string[] = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const keys = Object.keys(data);
    if (keys.length === 0) {
      emptyDocIds.push(doc.id);
    }
  });

  return { total: snap.size, emptyDocIds };
}

async function main() {
  console.log(`Iniciando limpeza de documentos vazios. Modo APPLY: ${APPLY}`);
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Credencial Firebase Admin ausente. Defina FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH ou GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }

  initAdmin();
  const db = getFirestore();

  const plan: Array<{ col: TargetCollection; total: number; emptyDocIds: string[] }> = [];

  for (const col of TARGET_COLLECTIONS) {
    const result = await findEmptyDocs(db, col);
    plan.push({ col, ...result });
  }

  let totalEmpty = 0;
  for (const item of plan) {
    totalEmpty += item.emptyDocIds.length;
    console.log(`Colecao ${item.col}: ${item.emptyDocIds.length} vazios de ${item.total} docs.`);
    if (item.emptyDocIds.length > 0) {
      console.log(`  IDs: ${item.emptyDocIds.join(', ')}`);
    }
  }

  console.log(`Total de documentos vazios encontrados: ${totalEmpty}`);

  if (!APPLY) {
    console.log('Dry-run finalizado. Use --apply para remover os documentos listados.');
    return;
  }

  if (totalEmpty === 0) {
    console.log('Nada para remover.');
    return;
  }

  let deleted = 0;
  for (const item of plan) {
    for (const id of item.emptyDocIds) {
      await db.collection(item.col).doc(id).delete();
      deleted += 1;
      console.log(`Removido: ${item.col}/${id}`);
    }
  }

  console.log(`Limpeza concluida. Documentos removidos: ${deleted}`);
}

main().catch((err) => {
  console.error('Falha na limpeza:', err);
  process.exit(1);
});
