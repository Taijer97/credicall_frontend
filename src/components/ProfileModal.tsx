import React, { useState, useEffect } from 'react';
import { 
  User, 
  MapPin, 
  Phone, 
  Calendar, 
  IdCard, 
  X,
  Save,
  Loader2,
  Briefcase,
  ExternalLink,
  ChevronRight,
  UserCircle,
  Wallet,
  History,
  TrendingDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, Client, Liquidation } from '../types';
import { cn } from '../lib/utils';
import { formatCurrency } from '../lib/utils';

interface ProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSelectClient?: (client: Client) => void;
}

type Tab = 'profile' | 'processes' | 'liquidations';

export function ProfileModal({ profile, onClose, onSelectClient }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(false);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [assignedClients, setAssignedClients] = useState<Client[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [loadingLiquidations, setLoadingLiquidations] = useState(false);
  const [formData, setFormData] = useState({
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    dni: profile.dni || '',
    birthDate: profile.birthDate || '',
    address: profile.address || '',
    phoneNumber: profile.phoneNumber || '',
    whatsappNumber: profile.whatsappNumber || '',
  });

  useEffect(() => {
    if (activeTab === 'processes') {
      fetchAssignedClients();
    }
    if (activeTab === 'liquidations') {
      fetchLiquidations();
    }
  }, [activeTab]);

  const fetchLiquidations = async () => {
    setLoadingLiquidations(true);
    try {
      const q = query(
        collection(db, 'liquidations'),
        where('userId', '==', profile.id),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const liqs: Liquidation[] = [];
      querySnapshot.forEach((doc) => {
        liqs.push({ id: doc.id, ...doc.data() } as Liquidation);
      });
      setLiquidations(liqs);
    } catch (error) {
      console.error('Error fetching liquidations:', error);
      handleFirestoreError(error, OperationType.GET, 'liquidations');
    } finally {
      setLoadingLiquidations(false);
    }
  };

  const fetchAssignedClients = async () => {
    setLoadingProcesses(true);
    try {
      const q = query(
        collection(db, 'clients'),
        where('assignedTo', '==', profile.id),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const clients: Client[] = [];
      querySnapshot.forEach((doc) => {
        clients.push({ id: doc.id, ...doc.data() } as Client);
      });
      setAssignedClients(clients);
    } catch (error) {
      console.error('Error fetching assigned clients:', error);
      handleFirestoreError(error, OperationType.GET, 'clients');
    } finally {
      setLoadingProcesses(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Check if DNI changed and if new DNI is already taken
      if (formData.dni !== profile.dni) {
        const dniQuery = query(collection(db, 'users'), where('dni', '==', formData.dni));
        const dniSnapshot = await getDocs(dniQuery);
        
        if (!dniSnapshot.empty) {
          alert('Este DNI ya está registrado por otro colaborador.');
          setLoading(false);
          return;
        }
      }

      const userRef = doc(db, 'users', profile.id);
      const updatedData = {
        ...formData,
        displayName: `${formData.firstName} ${formData.lastName}`.trim() || profile.displayName,
        updatedAt: serverTimestamp()
      };
      await updateDoc(userRef, updatedData);
      onClose();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('Error al actualizar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'interested': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'thinking': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'closed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'not_interested': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'interested': return 'Interesado';
      case 'thinking': return 'Pensándolo';
      case 'closed': return 'Cerrado';
      case 'not_interested': return 'No Interesado';
      case 'assigned': return 'Asignado';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#0A0C10] w-full max-w-4xl h-full md:h-[80vh] flex flex-col rounded-none md:rounded-[2rem] border-y md:border border-white/5 shadow-2xl overflow-hidden"
      >
        {/* Header Section */}
        <div className="relative h-32 md:h-40 bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-950 flex-shrink-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 md:p-2.5 bg-black/40 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all backdrop-blur-md border border-white/5 z-10"
          >
            <X size={18} className="md:w-5 md:h-5" />
          </button>

          <div className="absolute -bottom-10 md:-bottom-12 left-6 md:left-10 flex flex-row items-end gap-4 md:gap-6">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-3xl bg-surface border-4 border-[#0A0C10] shadow-2xl flex items-center justify-center relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl md:rounded-3xl"></div>
              <UserCircle size={60} className="text-emerald-500/20 group-hover:text-emerald-500/40 transition-colors md:w-20 md:h-20" />
              <div className="absolute bottom-1.5 right-1.5 w-3 h-3 md:w-4 md:h-4 bg-emerald-500 rounded-full border-2 border-[#0A0C10]"></div>
            </div>
            <div className="mb-2 md:mb-4">
              <h1 className="text-lg md:text-2xl font-black text-white leading-tight">
                {profile.displayName || 'Asesor Comercial'}
              </h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1 md:mt-2 flex items-center gap-1.5 md:gap-2">
                <Briefcase size={10} className="text-emerald-500 md:w-3 md:h-3" />
                {profile.role === 'admin' ? 'Admin' : 'Consultor'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-14 md:mt-16 px-6 md:px-10 flex items-center gap-6 md:gap-8 border-b border-white/5 flex-shrink-0">
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "pb-4 text-xs font-black uppercase tracking-widest transition-all relative",
              activeTab === 'profile' ? "text-emerald-500" : "text-slate-500 hover:text-white"
            )}
          >
            Información Personal
            {activeTab === 'profile' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('processes')}
            className={cn(
              "pb-4 text-xs font-black uppercase tracking-widest transition-all relative",
              activeTab === 'processes' ? "text-emerald-500" : "text-slate-500 hover:text-white"
            )}
          >
            Mis Procesos
            <span className="ml-2 px-1.5 py-0.5 rounded-md bg-white/5 text-[9px] border border-white/10">
              {assignedClients.length}
            </span>
            {activeTab === 'processes' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('liquidations')}
            className={cn(
              "pb-4 text-xs font-black uppercase tracking-widest transition-all relative",
              activeTab === 'liquidations' ? "text-emerald-500" : "text-slate-500 hover:text-white"
            )}
          >
            Billetera
            {activeTab === 'liquidations' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.form 
                key="profile-tab"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleSubmit} 
                className="p-6 md:p-10 space-y-6 md:space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <User size={12} /> Nombres
                    </label>
                    <input 
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                      placeholder="Tus nombres"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <User size={12} /> Apellidos
                    </label>
                    <input 
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                      placeholder="Tus apellidos"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <IdCard size={12} /> DNI (8 Dígitos)
                    </label>
                    <input 
                      name="dni"
                      value={formData.dni}
                      onChange={handleChange}
                      maxLength={8}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                      placeholder="00000000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={12} /> Fecha de Nacimiento
                    </label>
                    <input 
                      type="date"
                      name="birthDate"
                      value={formData.birthDate}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={12} /> Dirección de Domicilio
                  </label>
                  <input 
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                    placeholder="Av. Ejemplo 123..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Phone size={12} /> Teléfono Personal
                    </label>
                    <input 
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                      placeholder="999 999 999"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Phone size={12} className="text-emerald-500" /> WhatsApp Directo
                    </label>
                    <input 
                      name="whatsappNumber"
                      value={formData.whatsappNumber}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium"
                      placeholder="999 999 999"
                    />
                  </div>
                </div>

                <div className="pt-4 pb-2 md:pb-0">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {loading ? 'Sincronizando...' : 'Actualizar Perfil Profesional'}
                  </button>
                </div>
              </motion.form>
            ) : activeTab === 'processes' ? (
              <motion.div 
                key="processes-tab"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 md:p-10"
              >
                {loadingProcesses ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-500">
                    <Loader2 size={32} className="animate-spin text-emerald-500" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Cargando procesos...</p>
                  </div>
                ) : assignedClients.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-600 border-2 border-dashed border-white/5 rounded-3xl md:rounded-[2rem]">
                    <Briefcase size={32} className="opacity-20 md:w-10 md:h-10" />
                    <p className="text-xs font-medium px-6 text-center">No tienes procesos de crédito activos.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {assignedClients.map((client) => (
                      <div 
                        key={client.id}
                        onClick={() => onSelectClient?.(client)}
                        className="group bg-white/5 border border-white/10 rounded-2xl md:rounded-[1.5rem] p-4 md:p-5 hover:bg-white/[0.08] hover:border-emerald-500/30 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0"
                      >
                        <div className="flex items-center gap-4 md:gap-5">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-white/5 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-all">
                            <User size={18} className="md:w-5 md:h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-white mb-1 truncate">
                              {client.firstName} {client.lastName}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                              <span className="text-[9px] md:text-[10px] font-medium text-slate-500 flex items-center gap-1.5">
                                <IdCard size={10} /> {client.dni}
                              </span>
                              <span className={cn(
                                "text-[8px] md:text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                getStatusColor(client.status)
                              )}>
                                {getStatusLabel(client.status)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-white/5">
                          <div className="text-left md:text-right md:mr-4">
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 md:mb-1">Actualizado</p>
                            <p className="text-[9px] md:text-[10px] font-bold text-white">
                              {client.updatedAt?.toDate()?.toLocaleDateString() || 'Reciente'}
                            </p>
                          </div>
                          <div className="p-2 bg-white/5 rounded-lg md:rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <ChevronRight size={14} className="md:w-4 md:h-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="liquidations-tab"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-6 md:p-10 space-y-8"
              >
                {/* Wallet Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-8 bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-3xl">
                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <Wallet size={12} /> Saldo Disponible
                    </div>
                    <div className="text-4xl font-black text-white font-mono">{formatCurrency(profile.commissionWallet || 0)}</div>
                  </div>
                  <div className="p-8 bg-black/20 border border-white/5 rounded-3xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <History size={12} /> Total Liquidado
                    </div>
                    <div className="text-4xl font-black text-white/50 font-mono">
                      {formatCurrency(liquidations.reduce((sum, l) => sum + l.amount, 0))}
                    </div>
                  </div>
                </div>

                {/* History */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <History size={14} className="text-indigo-400" /> Historial de Pagos
                  </h3>
                  
                  {loadingLiquidations ? (
                    <div className="py-20 flex justify-center">
                       <Loader2 className="animate-spin text-indigo-500" />
                    </div>
                  ) : liquidations.length === 0 ? (
                    <div className="py-20 text-center bg-black/20 border border-dashed border-white/5 rounded-3xl">
                       <TrendingDown className="mx-auto text-slate-700 mb-4 opacity-20" size={32} />
                       <p className="text-xs text-slate-600 font-medium">Aún no se han realizado liquidaciones.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {liquidations.map((liq) => (
                        <div key={liq.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center">
                               <History size={20} />
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{liq.paymentMethod}</div>
                              <div className="text-sm font-bold text-white mb-1">{liq.note || 'Liquidación de comisiones'}</div>
                              <p className="text-[9px] text-slate-500 font-bold">{liq.createdAt?.toDate()?.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black text-white font-mono">{formatCurrency(liq.amount)}</div>
                            <div className="text-[8px] font-black text-emerald-500 uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 mt-2">EXITOSO</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info */}
        <div className="px-6 md:px-10 py-4 md:py-6 border-t border-white/5 bg-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0 flex-shrink-0">
          <div className="flex items-center gap-6 md:gap-8 justify-between md:justify-start">
            <div className="text-left">
              <p className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-widest">Estado</p>
              <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 md:mt-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                <span className="text-[9px] md:text-[10px] font-bold text-white uppercase tracking-wider">Activo</span>
              </div>
            </div>
            <div className="hidden md:block w-px h-8 bg-white/5"></div>
            <div className="text-left">
              <p className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-widest">ID Agente</p>
              <div className="mt-0.5 md:mt-1">
                <span className="text-[9px] md:text-[10px] font-mono text-slate-500">#{profile.id.substring(0, 8)}</span>
              </div>
            </div>
          </div>
          
          <p className="text-[8px] md:text-[9px] font-medium text-slate-600 text-center md:text-right">
            Sincronización segura • {new Date().toLocaleDateString()}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
