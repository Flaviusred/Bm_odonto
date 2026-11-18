import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../firebase';
import { API_BASE } from '../lib/utils';
import type { PatientDocument } from '../types';
import { Button } from './Button';
import { Modal } from './Modal';

export function DeleteDocumentButton({ document }: { document: PatientDocument }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (deleting) return;
    setConfirming(false);
    setError(null);
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      if (!auth.currentUser) throw new Error('Faça login novamente para excluir documentos.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(document.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Falha ao excluir o documento (HTTP ${response.status}).`);
      }
      setConfirming(false);
      toast.success('Documento excluído.');
    } catch (err) {
      console.error('Falha ao excluir documento:', err);
      setError(err instanceof Error ? err.message : 'Falha ao excluir o documento.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600 hover:bg-red-50"
        aria-label={`Excluir ${document.name}`} title="Excluir documento" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <Modal isOpen={confirming} onClose={close} title="Excluir documento">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">
              Deseja excluir o documento <strong>{document.name}</strong>? Esta ação não pode ser desfeita.
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={close}>Cancelar</Button>
            <Button type="button" variant="danger" disabled={deleting} onClick={remove}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
