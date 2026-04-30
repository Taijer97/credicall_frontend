import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  key?: React.Key;
}

export function StatsCard({ label, value, icon: Icon, color, bg }: StatsCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-surface p-3 md:p-5 rounded-xl md:rounded-2xl border border-slate-800 shadow-sm flex items-center gap-3 md:gap-4"
    >
      <div className={`${bg} ${color} p-2 md:p-3 rounded-lg md:rounded-xl bg-opacity-10`}>
        <Icon className="w-5 h-5 md:w-6 md:h-6" />
      </div>
      <div className="min-w-0">
        <div className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{label}</div>
        <div className="text-sm md:text-2xl font-bold text-white tracking-tight truncate">{value}</div>
      </div>
    </motion.div>
  );
}
