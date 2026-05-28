import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: any) {
  const val = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(val)) return 'S/ 0.00';
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
}

export function formatDate(date: any) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  
  return `${day}/${month}/${year}`;
}

export function getCommission(amount: number) {
  if (amount === 500) return 25;
  if (amount === 1000) return 50;
  if (amount === 1500) return 75;
  return 0;
}
