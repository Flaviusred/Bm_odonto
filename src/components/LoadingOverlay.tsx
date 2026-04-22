import React from 'react';
import { createPortal } from 'react-dom';

export default function LoadingOverlay() {
  if (typeof document === 'undefined') return null;

  const overlay = (
    <div
      role="status"
      aria-busy="true"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', pointerEvents: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <svg className="animate-spin" style={{ width: 56, height: 56, color: '#10B981' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
          <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" style={{ opacity: 0.75 }}></path>
        </svg>
        <div style={{ color: '#f8f4f4', background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 6 }}>Carregando...</div>
      </div>
    </div>
  );

  // Use portal when possible to avoid stacking context issues; otherwise render inline
  try {
    if (createPortal && document?.body) return createPortal(overlay, document.body as any);
  } catch (e) {
    console.warn('[LoadingOverlay] portal failed, rendering inline', e);
  }

  return overlay;
}
