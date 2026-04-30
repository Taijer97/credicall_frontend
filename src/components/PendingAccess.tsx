import React from 'react';
import { Clock, ShieldAlert, LogOut, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';

interface PendingAccessProps {
  profile: UserProfile;
  onLogout: () => void;
}

export function PendingAccess({ profile, onLogout }: PendingAccessProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 max-w-md mx-auto text-center space-y-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-24 h-24 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center border border-amber-500/20"
      >
        <Clock size={48} className="animate-pulse" />
      </motion.div>

      <div className="space-y-3">
        <h1 className="text-2xl font-black text-white uppercase tracking-widest italic">Acceso en Espera</h1>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
          Hola <span className="text-white italic">{profile.displayName}</span>, tu cuenta ha sido registrada correctamente.
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
        <div className="flex items-start gap-3 text-left">
          <ShieldAlert className="text-amber-500 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest mb-1">Verificación Requerida</p>
            <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
              Un administrador debe revisar tu perfil y otorgarte los permisos necesarios (Trabajador o Administrador) para acceder al dashboard.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800/50">
          <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-2">
            <span>Estado del Registro</span>
            <span className="text-amber-500">Pendiente de Aprobación</span>
          </div>
          <div className="h-1.5 bg-black rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: "33%" }}
              animate={{ width: "66%" }}
              className="h-full bg-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 w-full">
        <button 
          onClick={() => {
            // A simple reload is the most reliable way to refresh all states in this environment
            // but we add a small delay to show feedback
            const btn = document.activeElement as HTMLButtonElement;
            if (btn) {
              btn.disabled = true;
              btn.innerText = 'Verificando...';
            }
            setTimeout(() => window.location.reload(), 500);
          }}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 disabled:opacity-50"
        >
          Verificar Estado <ArrowRight size={16} />
        </button>

        <button 
          onClick={onLogout}
          className="w-full py-4 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/30 text-slate-500 hover:text-red-500 font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
        >
          Cerrar Sesión <LogOut size={16} />
        </button>
      </div>

      <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">
        WasiTech System &bull; CrediCall WT
      </p>
    </div>
  );
}
