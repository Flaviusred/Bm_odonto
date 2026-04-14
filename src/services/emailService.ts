import { runWithLoading } from '../lib/loadingStore';
import { API_BASE } from '../lib/utils';

export const emailService = {
  sendAppointmentEmail: async (patientEmail: string, subject: string, details: string) => {
    try {
      await runWithLoading(async () => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const loginUrl = origin;

        // Enviar apenas o corpo: o servidor adicionará o cabeçalho (logo CID + texto Direitoria de Saúde / Bravo Odonto)
        const html = `
          <div style="font-family: Arial, sans-serif; color:#111; padding:0 12px">
            <p>${details}</p>
            <p style="text-align:center;margin:18px 0"><a href="${loginUrl}" style="display:inline-block;padding:12px 18px;background:#10B981;color:#fff;border-radius:6px;text-decoration:none">Acessar Portal</a></p>
            <hr />
            <p style="font-size:12px;color:#666">Este é um e-mail automático do Bravo Odonto.</p>
          </div>
        `;

        await fetch(`${API_BASE}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: patientEmail, subject, text: details, html, raw: true })
        });
      });
    } catch (error) {
      console.error("Failed to send email", error);
    }
  },
  sendPasswordResetEmail: async (userEmail: string, link: string, name?: string) => {
    try {
      const subject = 'Recuperação de senha - Bravo Odonto';
      const text = `Olá ${name || ''}\n\nRecebemos uma solicitação para redefinir sua senha. Acesse o link abaixo para criar uma nova senha:\n\n${link}\n\nSe você não solicitou essa alteração, ignore este e-mail. O link expira em 1 hora.\n\nVocê solicitou alteração de senha do seu acesso pessoal ao Bravo Odonto.\n\nPor questões de segurança, orientamos que ALTERE SUA SENHA após validar seu acesso.\n\nNão compartilhe estas informações com ninguém.`;
      const html = `
        <p>Olá ${name || ''},</p>
        <p>Você solicitou alteração de senha do seu acesso pessoal ao Bravo Odonto. Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#10B981;color:#fff;border-radius:6px;text-decoration:none">Redefinir Senha</a></p>
        <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
        <hr />
        <p><strong>Por questões de segurança, orientamos que <span style="text-transform:uppercase">ALTERE SUA SENHA</span> após validar seu acesso.</strong></p>
        <p>Não compartilhe estas informações com ninguém.</p>
      `;

      await runWithLoading(async () => {
        await fetch(`${API_BASE}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: userEmail, subject, text, html, raw: true })
        });
      });
    } catch (error) {
      console.error("Failed to send password reset email", error);
    }
  }
};
