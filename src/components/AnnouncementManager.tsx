import React, { useState } from 'react';
import { Announcement, UserRole } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { Bell, Plus, Trash2, Link as LinkIcon, Image as ImageIcon, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface AnnouncementManagerProps {
  announcements: Announcement[];
  onUpdateAnnouncements: (items: Announcement[]) => void;
}

export function AnnouncementManager({ announcements, onUpdateAnnouncements }: AnnouncementManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    link: '',
    mediaUrl: '',
    targetRoles: ['patient', 'dentist'] as UserRole[],
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.title.length < 5) newErrors.title = 'Título deve ter pelo menos 5 caracteres';
    if (formData.content.length < 10) newErrors.content = 'Conteúdo deve ter pelo menos 10 caracteres';
    if (formData.targetRoles.length === 0) newErrors.targetRoles = 'Selecione pelo menos um público alvo';
    if (formData.link && !/^https?:\/\/.+/.test(formData.link)) newErrors.link = 'URL inválida';
    if (formData.mediaUrl && !/^https?:\/\/.+/.test(formData.mediaUrl)) newErrors.mediaUrl = 'URL inválida';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const newAnnouncement: Announcement = {
      id: Math.random().toString(36).substr(2, 9),
      ...formData,
      createdAt: new Date().toISOString(),
      active: true,
    };
    onUpdateAnnouncements([...announcements, newAnnouncement]);
    setIsModalOpen(false);
    setFormData({ title: '', content: '', link: '', mediaUrl: '', targetRoles: ['patient', 'dentist'] });
    setErrors({});
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este aviso?')) {
      onUpdateAnnouncements(announcements.filter(a => a.id !== id));
    }
  };

  const toggleActive = (id: string) => {
    onUpdateAnnouncements(announcements.map(a => 
      a.id === id ? { ...a, active: !a.active } : a
    ));
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestão de Avisos</h1>
          <p className="text-zinc-500">Crie comunicados para pacientes e dentistas</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Aviso
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {announcements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((a) => (
          <Card key={a.id} className={cn(
            "border-none shadow-sm transition-opacity",
            !a.active && "opacity-60"
          )}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-zinc-900">{a.title}</h3>
                    <div className="flex gap-1">
                      {a.targetRoles.map(role => (
                        <span key={role} className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase">
                          {role === 'patient' ? 'Paciente' : role === 'dentist' ? 'Dentista' : 'Admin'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600">{a.content}</p>
                  <div className="flex flex-wrap gap-4">
                    {a.link && (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <LinkIcon className="h-3 w-3" />
                        <a href={a.link} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[200px]">{a.link}</a>
                      </div>
                    )}
                    {a.mediaUrl && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                        <ImageIcon className="h-3 w-3" />
                        <a href={a.mediaUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-[200px]">{a.mediaUrl}</a>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 uppercase">Criado em {new Date(a.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-2",
                      a.active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                    )}
                    onClick={() => toggleActive(a.id)}
                  >
                    {a.active ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {a.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {announcements.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-zinc-200">
            <Bell className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500">Nenhum aviso criado ainda.</p>
          </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setErrors({});
          setFormData({ title: '', content: '', link: '', mediaUrl: '', targetRoles: ['patient', 'dentist'] });
        }} 
        title="Novo Aviso"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            label="Título do Aviso" 
            required 
            value={formData.title}
            error={errors.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Conteúdo</label>
            <textarea 
              className={cn(
                "flex min-h-[100px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                errors.content && "border-red-500 focus-visible:ring-red-500"
              )}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
            {errors.content && <p className="text-xs text-red-500">{errors.content}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="Link (Opcional)" 
              placeholder="https://..."
              value={formData.link}
              error={errors.link}
              onChange={(e) => setFormData({ ...formData, link: e.target.value })}
            />
            <Input 
              label="URL de Mídia/Imagem (Opcional)" 
              placeholder="https://..."
              value={formData.mediaUrl}
              error={errors.mediaUrl}
              onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">Público Alvo</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.targetRoles.includes('patient')}
                  onChange={(e) => {
                    const roles = e.target.checked 
                      ? [...formData.targetRoles, 'patient'] 
                      : formData.targetRoles.filter(r => r !== 'patient');
                    setFormData({ ...formData, targetRoles: roles as UserRole[] });
                  }}
                  className="rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-zinc-600">Pacientes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.targetRoles.includes('dentist')}
                  onChange={(e) => {
                    const roles = e.target.checked 
                      ? [...formData.targetRoles, 'dentist'] 
                      : formData.targetRoles.filter(r => r !== 'dentist');
                    setFormData({ ...formData, targetRoles: roles as UserRole[] });
                  }}
                  className="rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-zinc-600">Dentistas</span>
              </label>
            </div>
            {errors.targetRoles && <p className="text-xs text-red-500">{errors.targetRoles}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Publicar Aviso
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
