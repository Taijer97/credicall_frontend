import React from 'react';
import { type Client } from '../types';
import { Users, Search, MapPin, Building2, MessageSquare, ChevronRight, UserCheck, Lock, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ClientTableProps {
  clients: Client[];
  onSelect: (client: Client) => void;
  currentUserId: string;
  isAdmin: boolean;
  onSearch?: (query: string) => void;
  searchQuery?: string;
  isSearching?: boolean;
}

const statusColors = {
  available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  assigned: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  interested: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  thinking: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  not_interested: 'bg-slate-700/50 text-slate-400 border-slate-600',
  closed: 'bg-emerald-600 text-white border-emerald-700',
};

const statusLabels = {
  available: 'Disponible',
  assigned: 'En Proceso',
  interested: 'Interesado',
  thinking: 'Pensándolo',
  not_interested: 'No Interesado',
  closed: 'Cerrado',
};

export function ClientTable({ clients, onSelect, currentUserId, isAdmin, onSearch, searchQuery, isSearching }: ClientTableProps) {
  const handleAttend = async (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    if (client.status !== 'available') return;

    try {
      const clientRef = doc(db, 'clients', client.dni);
      
      // Double check if already exists in DB with a non-available status
      // (since local state might be partial)
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        const existingData = clientSnap.data() as Client;
        if (existingData.status !== 'available' && existingData.assignedTo !== currentUserId) {
          alert('Este lead ya está siendo atendido por otro colaborador.');
          return;
        }
      }

      // Update (or create if from API)
      await setDoc(clientRef, {
        ...client,
        id: client.dni,
        status: 'assigned',
        assignedTo: currentUserId,
        lockedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error locking client:', error);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
        <h2 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <Users size={16} className="text-emerald-500" />
          Cola de Leads
        </h2>
        <div className="relative flex-1 max-w-xs">
          {isSearching ? (
             <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" size={14} />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          )}
          <input 
            type="text" 
            placeholder="DNI (8 dígitos) o nombre..."
            value={searchQuery}
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 bg-black/20 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/10 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
              <th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Vínculo</th>
              <th className="px-6 py-4">Calificación</th>
              <th className="px-6 py-4">Información</th>
              <th className="px-6 py-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {clients.map((client) => {
              const isLockedByMe = client.assignedTo === currentUserId;
              const isAvailable = client.status === 'available';

              const getQualification = (c: Client) => {
                if (!c.financialData) return 'potencial';
                if (c.financialData.paidInstallments >= 3 && c.financialData.currentMonthPaid) return 'apto';
                return 'no_apto';
              };

              const q = getQualification(client);

              const qualificationConfig = {
                potencial: { 
                  label: 'Potencial', 
                  sub: 'Sin historial',
                  icon: Users,
                  classes: 'text-blue-400 bg-blue-500/10 border-blue-500/20' 
                },
                no_apto: { 
                  label: 'No APTO', 
                  sub: client.financialData && !client.financialData.currentMonthPaid ? 'Mora Mes' : 'Reciente',
                  icon: AlertCircle,
                  classes: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                },
                apto: { 
                  label: 'APTO', 
                  sub: 'Califica OK',
                  icon: CheckCircle,
                  classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                },
              };

              const Config = qualificationConfig[q];
              const StatusIcon = Config.icon;

              return (
                <tr 
                  key={client.id}
                  onClick={() => {
                    if (client.status === 'closed') return;
                    onSelect(client);
                  }}
                  className={cn(
                    "group transition-all",
                    client.status === 'closed' ? "opacity-60 cursor-not-allowed grayscale-[0.5]" : "cursor-pointer hover:bg-white/[0.02]",
                    isLockedByMe ? "bg-emerald-500/5" : ""
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors uppercase">{client.lastName} {client.firstName}</div>
                    <div className="text-[10px] text-slate-500 uppercase mb-0.5 tracking-tight">DNI: {client.dni}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-widest",
                      statusColors[client.status]
                    )}>
                      {statusLabels[client.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {client.laborData?.laborStatus ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-widest inline-block w-fit",
                          client.laborData.laborStatus === 'nombrado' ? "text-purple-400 bg-purple-500/10 border-purple-500/30" : "text-slate-400 bg-slate-500/10 border-slate-500/30"
                        )}>
                          {client.laborData.laborStatus}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 uppercase font-bold">Sin Datos</span>
                      )}
                      {client.laborData?.endDate && (
                        <span className="text-[9px] text-slate-500 font-mono font-bold">
                          FIN: {formatDate(client.laborData.endDate)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "inline-flex flex-col px-2.5 py-1 rounded-lg border transition-all group-hover:scale-105",
                      Config.classes
                    )}>
                      <div className="flex items-center gap-1">
                        <StatusIcon size={10} strokeWidth={3} />
                        <span className="text-[9px] font-black uppercase tracking-wider">{Config.label}</span>
                      </div>
                      <span className="text-[8px] font-bold opacity-60 uppercase tracking-tighter leading-none mt-0.5">{Config.sub}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Building2 size={12} className="text-emerald-500" />
                      <span className="text-[10px] text-slate-300 font-bold uppercase truncate max-w-[150px]">
                        {client.laborData?.company || 'Sin Institución'}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      CÓD: {client.laborData?.modularCode || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isAvailable ? (
                      <button 
                        onClick={(e) => handleAttend(e, client)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-3 py-1.5 rounded uppercase tracking-tighter transition-all"
                      >
                        Atender
                      </button>
                    ) : isLockedByMe ? (
                      <div className="flex items-center justify-end gap-1 text-emerald-500">
                        <UserCheck size={14} />
                        <span className="text-[9px] font-black uppercase">Mío</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 text-slate-600">
                        <Lock size={14} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">Ocupado</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile view cards */}
      <div className="md:hidden divide-y divide-slate-800">
        {clients.map((client) => {
          const isLockedByMe = client.assignedTo === currentUserId;
          const isAvailable = client.status === 'available';

          const getQualification = (c: Client) => {
            if (!c.financialData) return 'potencial';
            if (c.financialData.paidInstallments >= 3 && c.financialData.currentMonthPaid) return 'apto';
            return 'no_apto';
          };

          const q = getQualification(client);
          const qualificationConfig = {
            potencial: { label: 'Potencial', classes: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Users },
            no_apto: { label: 'No APTO', classes: 'text-red-400 bg-red-500/10 border-red-500/20', icon: AlertCircle },
            apto: { label: 'APTO', classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
          };
          const Config = qualificationConfig[q];

          return (
            <div 
              key={client.id}
              onClick={() => {
                if (client.status === 'closed') return;
                onSelect(client);
              }}
              className={cn(
                "p-4 flex flex-col gap-3 transition-all",
                client.status === 'closed' ? "opacity-60 grayscale-[0.5]" : "active:bg-white/5",
                isLockedByMe ? "bg-emerald-500/5" : ""
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase leading-tight line-clamp-1">
                    {client.lastName} {client.firstName}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">DNI {client.dni}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-widest h-fit",
                  statusColors[client.status]
                )}>
                  {statusLabels[client.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "px-2 py-1 rounded inline-flex items-center gap-1.5 border w-full justify-center",
                    Config.classes
                  )}>
                    <Config.icon size={10} />
                    <span className="text-[8px] font-black uppercase">{Config.label}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center bg-white/5 border border-white/5 rounded px-2 py-1">
                   <Building2 size={10} className="text-emerald-500 mr-1.5" />
                   <span className="text-[9px] text-slate-300 font-bold uppercase truncate">
                    {client.laborData?.company || 'Sin Inst.'}
                   </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Institución</span>
                  <span className="text-[9px] font-bold text-slate-300 uppercase truncate max-w-[120px]">
                    {client.laborData?.modularCode || 'N/A'}
                  </span>
                </div>
                <div>
                  {isAvailable ? (
                    <button 
                      onClick={(e) => handleAttend(e, client)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black px-4 py-2 rounded uppercase tracking-tighter transition-all shadow-lg shadow-emerald-900/40"
                    >
                      Atender Ahora
                    </button>
                  ) : isLockedByMe ? (
                    <div className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                      <UserCheck size={12} />
                      <span className="text-[9px] font-black uppercase">Mío</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                      <Lock size={12} />
                      <span className="text-[9px] font-black uppercase tracking-tighter">En Uso</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
