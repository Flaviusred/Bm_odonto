import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Base URL do servidor Express. Em produção aponta para VITE_API_URL (ex: URL do Render).
 * Em desenvolvimento fica vazio, fazendo chamadas relativas ao servidor local.
 */
export const API_BASE = ((import.meta as any).env?.VITE_API_URL as string || '').replace(/\/$/, '');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function validateCPF(cpf: string) {
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}

export function maskCPF(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
}

export function maskPhone(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
}

export function maskCEP(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{3})\d+?$/, '$1');
}

export function maskCRO(value: string) {
  const v = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const numbers = v.replace(/[^0-9]/g, '');
  const letters = v.replace(/[^A-Z]/g, '').substring(0, 2);
  
  if (letters.length > 0) {
    return `${numbers}-${letters}`;
  }
  return numbers;
}
