/**
 * Relatório (somente leitura) de cadastros de pacientes que foram SOBRESCRITOS.
 *
 * Até a correção, cadastrar um paciente com e-mail e senha de um login já existente gravava o
 * novo paciente com o MESMO ID do anterior, apagando o cadastro antigo. O Firestore não guarda
 * o conteúdo apagado, mas o Histórico (audit_logs) registra cada "Criação" com o nome do
 * paciente. Este script cruza o histórico com os cadastros atuais e lista quem se perdeu,
 * para a equipe recadastrar (de preferência como dependente do responsável).
 *
 * Não altera nada.
 *
 * Uso (no servidor):
 *   GOOGLE_APPLICATION_CREDENTIALS=/etc/bm_odonto/service-account.json npm run pacientes:sobrescritos
 */
import dotenv from 'dotenv';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

dotenv.config();

const IS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const clientConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
const databaseId = String(clientConfig.firestoreDatabaseId || '').trim();

const app = (() => {
  if (IS_EMULATOR) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return initializeApp({ projectId: 'demo-bm-odonto' });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || clientConfig.projectId;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && fs.existsSync(keyPath)) {
    return initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf-8'))), projectId });
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId });
})();
const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

type LogEntry = { action: string; name: string; when: string; by: string };

const nameFromDetails = (details: unknown) => {
  const text = String(details || '');
  const match = text.match(/^Paciente (.+?) (criado|excluído)\.?$/);
  return match ? match[1] : text;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
};

const main = async () => {
  const logsSnap = await db.collection('audit_logs').where('entityType', '==', 'patient').get();
  const byPatient = new Map<string, LogEntry[]>();
  logsSnap.forEach((doc) => {
    const data = doc.data() || {};
    if (!['Criação', 'Exclusão'].includes(data.action) || !data.entityId) return;
    const list = byPatient.get(data.entityId) || [];
    list.push({ action: data.action, name: nameFromDetails(data.details), when: String(data.timestamp || ''), by: String(data.userName || '') });
    byPatient.set(data.entityId, list);
  });

  const lost: string[] = [];
  for (const [patientId, entries] of byPatient) {
    const creations = entries.filter((e) => e.action === 'Criação').sort((a, b) => a.when.localeCompare(b.when));
    if (creations.length < 2) continue; // só um cadastro com esse ID: nada foi sobrescrito
    const current = await db.collection('patients').doc(patientId).get();
    const currentName = current.exists ? String(current.data()?.name || '') : '(cadastro inexistente hoje)';
    const overwritten = creations.slice(0, -1).filter((c) => c.name !== currentName);
    if (overwritten.length === 0) continue;
    lost.push([
      `ID ${patientId} — hoje: ${currentName}`,
      ...creations.map((c) => `    ${formatDate(c.when)}  cadastrado "${c.name}" por ${c.by || '?'}`),
      `    => cadastro(s) perdido(s): ${overwritten.map((c) => c.name).join(', ')}`,
    ].join('\n'));
  }

  console.log(`\nHistórico analisado: ${logsSnap.size} registro(s) de pacientes, ${byPatient.size} ID(s).`);

  // Exclusões registradas (para descartar/confirmar que pacientes foram apagados pelo botão Excluir).
  const deletions = [...byPatient.values()].flat().filter((e) => e.action === 'Exclusão').sort((a, b) => b.when.localeCompare(a.when));
  console.log(`\nExclusões de pacientes registradas: ${deletions.length}`);
  deletions.slice(0, 50).forEach((d) => console.log(`    ${formatDate(d.when)}  excluído "${d.name}" por ${d.by || '?'}`));
  if (deletions.length > 50) console.log(`    ... e mais ${deletions.length - 50}`);
  if (lost.length === 0) {
    console.log('Nenhum cadastro sobrescrito encontrado no histórico.\n');
    return;
  }
  console.log(`\n${lost.length} ID(s) com cadastro(s) sobrescrito(s):\n`);
  console.log(lost.join('\n\n'));
  console.log('\nRecadastre os pacientes perdidos (de preferência pela ficha do responsável, em "Adicionar Dependente").\n');
};

main().then(() => process.exit(0)).catch((err) => {
  console.error('Falha:', err instanceof Error ? err.message : err);
  process.exit(1);
});
