import React, { useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { User } from '../types';
import { Upload } from 'lucide-react';

const PROFILE_IMAGE_MAX_MB = 1;
const PROFILE_IMAGE_MAX_BYTES = PROFILE_IMAGE_MAX_MB * 1024 * 1024;
const PROFILE_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onOpenPasswordChange: () => void;
}

export function ProfileEditModal({ isOpen, onClose, user, onUpdateUser, onOpenPasswordChange }: ProfileEditModalProps) {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    photoURL: user.photoURL || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!PROFILE_ALLOWED_IMAGE_TYPES.includes(file.type)) {
        alert('Formato de imagem inválido. Use JPG, PNG ou WEBP.');
        e.target.value = '';
        return;
      }

      if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        alert(`Imagem de perfil muito grande. Limite: ${PROFILE_IMAGE_MAX_MB}MB.`);
        e.target.value = '';
        return;
      }

      // Simulate file upload by creating a local URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photoURL: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    let maskedValue = value;
    if (value.length > 7) {
      maskedValue = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
      maskedValue = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      maskedValue = `(${value}`;
    }
    setFormData({...formData, phone: maskedValue});
  };

  const [showConfirm, setShowConfirm] = useState(false);

  React.useEffect(() => {
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      photoURL: user.photoURL || '',
    });
  }, [user]);

  React.useEffect(() => {
    if (!isOpen) {
      setShowConfirm(false);
      setErrors({});
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setShowConfirm(true);
    }
  };

  const confirmUpdate = () => {
    onUpdateUser({ ...user, ...formData });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Perfil" closeOnBackdropClick={false}>
      {showConfirm ? (
        <div className="space-y-4">
          <p className="text-zinc-700">Tem certeza que deseja salvar as alterações no perfil?</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button onClick={confirmUpdate}>Confirmar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            <img 
              src={formData.photoURL || `https://ui-avatars.com/api/?name=${formData.name}&background=10b981&color=fff`} 
              alt={formData.name}
              className="h-24 w-24 rounded-full object-cover border-2 border-emerald-500"
            />
            <label className="cursor-pointer bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Alterar Foto
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
            <p className="text-xs text-zinc-500">JPG, PNG ou WEBP (max. 1MB)</p>
          </div>
          <Input label="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} error={errors.name} required />
          <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} error={errors.email} required />
          <Input label="Telefone" type="tel" value={formData.phone} onChange={handlePhoneChange} />
          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={onOpenPasswordChange}>Alterar Senha</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
