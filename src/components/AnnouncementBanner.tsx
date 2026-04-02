import React from 'react';
import { Announcement, UserRole } from '../types';
import { Bell, Link as LinkIcon, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';

interface AnnouncementBannerProps {
  announcements: Announcement[];
  userRole: UserRole;
}

export function AnnouncementBanner({ announcements, userRole }: AnnouncementBannerProps) {
  const activeAnnouncements = announcements.filter(a => a.active && a.targetRoles.includes(userRole));
  const [closedIds, setClosedIds] = useState<string[]>([]);

  const visibleAnnouncements = activeAnnouncements.filter(a => !closedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="px-2 sm:px-4 lg:px-8 pt-4 space-y-2">
      {visibleAnnouncements.map((a) => (
        <div 
          key={a.id} 
          className="relative overflow-hidden bg-emerald-500 text-white rounded-2xl p-3 sm:p-4 shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top duration-500"
        >
          <div className="flex items-start gap-3 sm:gap-4 pr-8">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-bold text-xs sm:text-sm">{a.title}</h4>
              <p className="text-[10px] sm:text-xs text-white/90 leading-relaxed">{a.content}</p>
              <div className="flex flex-wrap gap-4 pt-1">
                {a.link && (
                  <a 
                    href={a.link} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    <LinkIcon className="h-3 w-3" />
                    Saiba Mais
                  </a>
                )}
                {a.mediaUrl && (
                  <a 
                    href={a.mediaUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    <ImageIcon className="h-3 w-3" />
                    Ver Mídia
                  </a>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setClosedIds([...closedIds, a.id])}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          
          {/* Decorative background pattern */}
          <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-white/10 rounded-full blur-2xl" />
        </div>
      ))}
    </div>
  );
}
