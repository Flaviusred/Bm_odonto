import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  closeOnBackdropClick?: boolean;
}

export function Modal({ isOpen, onClose, title, children, className, closeOnBackdropClick = true }: ModalProps) {
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdropClick ? onClose : undefined}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                'relative w-full max-w-lg flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl bg-white shadow-2xl pointer-events-auto',
                className
              )}
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-6 shrink-0">
                <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
