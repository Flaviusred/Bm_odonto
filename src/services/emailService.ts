export const emailService = {
  sendAppointmentEmail: async (patientEmail: string, subject: string, details: string) => {
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: patientEmail, subject, text: details })
      });
    } catch (error) {
      console.error("Failed to send email", error);
    }
  },
  sendPasswordResetEmail: async (userEmail: string, newPassword: string) => {
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: userEmail, subject: 'Recuperação de Senha', text: `Sua nova senha é: ${newPassword}` })
      });
    } catch (error) {
      console.error("Failed to send password reset email", error);
    }
  }
};
