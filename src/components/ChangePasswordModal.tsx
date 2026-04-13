import React, { useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { User } from '../types';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../firebase';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (updated: User) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!currentPassword) newErrors.currentPassword = 'Senha atual é obrigatória.';
    if (!newPassword) {
      newErrors.newPassword = 'Nova senha é obrigatória';
    } else if (newPassword.length < 6) {
      newErrors.newPassword = 'A nova senha deve ter pelo menos 6 caracteres';
    }
    if (newPassword !== confirmPassword) newErrors.confirmPassword = 'As novas senhas não coincidem';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const current = auth.currentUser;
      if (!current || !current.email) {
        setErrors({ currentPassword: 'Sessão inválida. Faça login novamente.' });
        return;
      }

      const credential = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, credential);
      await updatePassword(current, newPassword);

      // Mantém o fluxo de atualização de perfil sem persistir senha no Firestore.
      onUpdateUser({ ...user });
      onClose();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      alert('Senha alterada com sucesso!');
    } catch (error) {
      setErrors({ currentPassword: 'Não foi possível alterar a senha. Verifique a senha atual.' });
    }
  };

  React.useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Alterar Senha" closeOnBackdropClick={false}>
      <div className="space-y-4">
        <Input label="Senha Atual" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} error={errors.currentPassword} />
        <Input label="Nova Senha" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={errors.newPassword} />
        <Input label="Confirmar Nova Senha" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={errors.confirmPassword} />
        <Button onClick={handleSubmit} className="w-full">Alterar Senha</Button>
      </div>
    </Modal>
  );
};
