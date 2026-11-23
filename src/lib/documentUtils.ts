import { auth } from '../firebase';
import { API_BASE } from './utils';
import type { PatientDocument } from '../types';

export const DOCUMENT_MAX_MB = 2;
export const DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MB * 1024 * 1024;

export const LEGACY_DOCUMENT_MESSAGE =
  'Este documento foi enviado antes da correção do armazenamento e não está mais disponível. Solicite o novo envio (upload) do arquivo.';

export function isLegacyUnavailableDocument(url: string): boolean {
  return !url || url.startsWith('blob:');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/pdf';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Retorna false quando o documento não pode mais ser aberto (URL blob: antiga).
export async function openStoredDocument(document: PatientDocument): Promise<boolean> {
  const { url, storagePath, id } = document;
  if (isLegacyUnavailableDocument(url)) return false;
  if (storagePath?.startsWith('secure-patient-documents/')) {
    const tab = window.open('', '_blank');
    if (!tab) throw new Error('Permita a abertura de novas abas para visualizar o documento.');
    tab.opener = null;
    tab.document.title = 'Carregando documento';
    const style = tab.document.createElement('style');
    style.textContent = `
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; color: #18181b; font-family: system-ui, sans-serif; }
      main { box-sizing: border-box; width: min(90%, 420px); padding: 32px; border-radius: 16px; background: white; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      h1 { margin: 0 0 8px; font-size: 1.25rem; }
      p { margin: 0 0 20px; color: #52525b; line-height: 1.5; }
      progress { display: block; width: 100%; height: 12px; accent-color: #10b981; }
    `;
    tab.document.head.appendChild(style);
    const panel = tab.document.createElement('main');
    const heading = tab.document.createElement('h1');
    heading.textContent = 'Abrindo documento';
    const message = tab.document.createElement('p');
    message.textContent = 'Carregando documento, aguarde...';
    message.setAttribute('role', 'status');
    const progress = tab.document.createElement('progress');
    progress.setAttribute('aria-label', 'Carregando documento');
    panel.append(heading, message, progress);
    tab.document.body.appendChild(panel);
    try {
      if (!auth.currentUser) throw new Error('Faça login novamente para abrir o documento.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Falha ao abrir o documento (HTTP ${response.status}).`);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      if (tab.closed) {
        URL.revokeObjectURL(blobUrl);
        return true;
      }
      tab.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return true;
    } catch (error) {
      if (!tab.closed) {
        tab.document.title = 'Erro ao abrir documento';
        heading.textContent = 'Não foi possível abrir o documento';
        message.textContent = error instanceof Error ? error.message : 'Falha ao abrir o documento.';
        message.setAttribute('role', 'alert');
        progress.remove();
      }
      throw error;
    }
  }
  if (!url.startsWith('data:')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  const blobUrl = URL.createObjectURL(dataUrlToBlob(url));
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return true;
}
