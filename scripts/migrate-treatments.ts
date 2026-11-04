import 'dotenv/config';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

type ProcedureType =
  | 'DENTISTICA' | 'PERIODONTIA' | 'PROFILAXIA' | 'RAIO_X' | 'EXODONTIA'
  | 'ENCAMINHAMENTO' | 'AVALIACAO' | 'RECEITA_PRESCRICAO' | 'ENDODONTIA'
  | 'ORTODONTIA' | 'OUTRO';

const legacyMap: Record<string, ProcedureType> = {
  Limpeza: 'PROFILAXIA', cleaning: 'PROFILAXIA', Cleaning: 'PROFILAXIA',
  Extração: 'EXODONTIA', extraction: 'EXODONTIA', Extraction: 'EXODONTIA',
  Obturação: 'DENTISTICA', filling: 'DENTISTICA', Filling: 'DENTISTICA',
  Canal: 'ENDODONTIA', 'root-canal': 'ENDODONTIA', 'Root Canal': 'ENDODONTIA',
  Ortodontia: 'ORTODONTIA', orthodontics: 'ORTODONTIA', Orthodontics: 'ORTODONTIA',
  Outro: 'OUTRO', other: 'OUTRO', Other: 'OUTRO',
};

const projectId = process.env.FIREBASE_PROJECT_ID || undefined;
const databaseId = process.env.FIREBASE_DATABASE_ID || undefined;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountJson && credentialsFile && !fs.existsSync(credentialsFile)) {
  throw new Error(`Arquivo GOOGLE_APPLICATION_CREDENTIALS não encontrado: ${credentialsFile}`);
}

const parseCredentials = (contents: string, source: string) => {
  try {
    const parsed = JSON.parse(contents);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('o conteúdo não é um objeto JSON');
    }
    if (parsed.type !== 'service_account' || !parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('o JSON não contém os campos esperados de uma Service Account');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Credencial inválida em ${source}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const credential = serviceAccountJson
  ? cert(parseCredentials(serviceAccountJson, 'FIREBASE_SERVICE_ACCOUNT_JSON'))
  : credentialsFile
    ? cert(parseCredentials(fs.readFileSync(credentialsFile, 'utf8'), credentialsFile))
    : applicationDefault();

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential, projectId });
const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

const backupCollection = `treatments_migration_backup_${new Date().toISOString().replace(/[-:.TZ]/g, '')}`;
const apply = process.argv.includes('--apply');

const normalizeType = (value: unknown): ProcedureType =>
  typeof value === 'string' && legacyMap[value] ? legacyMap[value] :
  typeof value === 'string' && value.toUpperCase() in legacyMap
    ? value.toUpperCase() as ProcedureType
    : 'OUTRO';

async function main() {
  if (!serviceAccountJson && credentialsFile) {
    if (!fs.existsSync(credentialsFile)) {
      throw new Error(
        `Arquivo GOOGLE_APPLICATION_CREDENTIALS não encontrado: ${credentialsFile}`
      );
    }
  }

  const snapshot = await db.collection('treatments').get();
  console.log(`${apply ? 'Migrando' : 'Dry-run'} ${snapshot.size} tratamentos.`);
  if (!apply) {
    console.log('Nenhum documento será alterado. Use --apply somente após revisar o dry-run.');
  }

  for (const treatment of snapshot.docs) {
    const data = treatment.data() as Record<string, unknown>;
    if (Array.isArray(data.procedures) && data.procedures.length > 0) continue;

    const type = normalizeType(data.type);
    const procedures = [{
      type,
      quantity: 1,
      ...(type === 'OUTRO' && typeof data.description === 'string' && data.description.trim()
        ? { description: data.description.trim() }
        : {}),
    }];
    console.log(`${treatment.id}: ${String(data.type || 'sem tipo')} -> ${type}`);

    if (apply) {
      await db.collection(backupCollection).doc(treatment.id).set({
        ...data,
        backedUpAt: new Date().toISOString(),
      });
      await treatment.ref.update({ procedures });
    }
  }

  if (apply) {
    console.log(`Backup criado em ${backupCollection}. Para reverter, restaure os documentos dessa coleção.`);
  }
}

main().catch((error) => {
  console.error('Falha na migração de tratamentos:', error);
  process.exitCode = 1;
});
