import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, increment, writeBatch, serverTimestamp, getDocs, deleteDoc, orderBy, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { type Credit, type UserProfile, type Client, type Liquidation, type Role } from '../types';
import { Check, X, ShieldAlert, Award, RefreshCw, Users, TrendingUp, BarChart3, UserMinus, ShieldCheck, PieChart, Wallet, Trash2, History, Banknote, Loader2, User } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { forceSeed } from '../lib/seed';
import { cn } from '../lib/utils';

export function AdminPanel({ profile }: { profile: UserProfile }) {
  const isSupport = profile.role === 'support';
  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'stats'>(isSupport ? 'approvals' : 'approvals');

  useEffect(() => {
    if (isSupport && activeTab !== 'approvals') {
      setActiveTab('approvals');
    }
  }, [isSupport, activeTab]);
  const [pendingCredits, setPendingCredits] = useState<Credit[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allCredits, setAllCredits] = useState<Credit[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<string | null>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<string | null>(null);
  const [selectedUserLiquidations, setSelectedUserLiquidations] = useState<string | null>(null);
  const [showLiquidationModal, setShowLiquidationModal] = useState<UserProfile | null>(null);
  const [liquidating, setLiquidating] = useState(false);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [userUpdating, setUserUpdating] = useState<string | null>(null);
  const [userDeleting, setUserDeleting] = useState<string | null>(null);
  const [showRejectionModal, setShowRejectionModal] = useState<Credit | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  const [liquidationForm, setLiquidationForm] = useState({
    amount: 0,
    paymentMethod: 'transferencia' as const,
    note: ''
  });

  useEffect(() => {
    if (isSupport) {
      setLiquidations([]);
      return;
    }
    
    const qLiq = query(collection(db, 'liquidations'), orderBy('createdAt', 'desc'));
    const unsubLiq = onSnapshot(qLiq, (snapshot) => {
      setLiquidations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Liquidation)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liquidations');
    });

    return () => unsubLiq();
  }, [isSupport]);

  useEffect(() => {
    // Listen to credits
    const qCredits = query(collection(db, 'credits'), orderBy('createdAt', 'desc'));
    const unsubCredits = onSnapshot(qCredits, (snapshot) => {
      const credits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Credit));
      setPendingCredits(credits.filter(c => c.status === 'pending'));
      setAllCredits(credits);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'credits');
    });

    // Listen to users
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Listen to all clients that have some interaction or status
    const qClients = query(collection(db, 'clients'), where('status', '!=', 'available'));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setAllClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    setLoading(false);
    return () => {
      unsubCredits();
      unsubUsers();
      unsubClients();
    };
  }, []);

  const handleReset = async () => {
    if (!confirm('¿ESTÁ SEGURO? Esto borrará todos los clientes actuales y volverá a cargar los datos de prueba.')) return;
    
    setResetting(true);
    try {
      const q = query(collection(db, 'clients'));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      await forceSeed();
      alert('Base de datos reseteada correctamente.');
      window.location.reload();
    } catch (error) {
      console.error('Reset error:', error);
    } finally {
      setResetting(false);
    }
  };

  const handleApproval = async (credit: Credit, status: 'approved' | 'rejected', reason?: string) => {
    setProcessingAction(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Update credit status
      const creditRef = doc(db, 'credits', credit.id);
      const updateData: any = {
        status,
        adminId: profile.id,
        approvedAt: serverTimestamp()
      };
      if (reason) updateData.rejectionReason = reason;
      
      batch.update(creditRef, updateData);

      // 2. If approved, add commission to worker
      if (status === 'approved') {
        const workerRef = doc(db, 'users', credit.workerId);
        batch.update(workerRef, {
          commissionWallet: increment(credit.commission)
        });
        
        // Also mark client as closed
        const clientRef = doc(db, 'clients', credit.clientId);
        batch.update(clientRef, { status: 'closed' });
      }

      // 3. Create Notification for Worker
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        userId: credit.workerId,
        title: status === 'approved' ? '¡Crédito Aprobado!' : 'Crédito Rechazado',
        message: status === 'approved' 
          ? `Tu solicitud de ${formatCurrency(credit.amount)} ha sido aprobada. +${formatCurrency(credit.commission)} a tu billetera.`
          : `Tu solicitud de ${formatCurrency(credit.amount)} ha sido rechazada por el administrador.${reason ? ` Motivo: ${reason}` : ''}`,
        type: status === 'approved' ? 'success' : 'error',
        read: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      alert(`Crédito ${status === 'approved' ? 'Aprobado' : 'Rechazado'} correctamente`);
      setShowRejectionModal(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Error in approval workflow:', error);
      alert('Error al procesar la aprobación');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleLiquidate = async () => {
    if (!showLiquidationModal) return;
    if (liquidationForm.amount <= 0) {
      alert('El monto debe ser mayor a 0');
      return;
    }
    if (liquidationForm.amount > showLiquidationModal.commissionWallet) {
      alert('El monto no puede ser mayor al disponible en la billetera');
      return;
    }

    setLiquidating(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Add liquidation record
      const liqRef = doc(collection(db, 'liquidations'));
      batch.set(liqRef, {
        userId: showLiquidationModal.id,
        amount: liquidationForm.amount,
        paymentMethod: liquidationForm.paymentMethod,
        note: liquidationForm.note,
        createdAt: serverTimestamp()
      });

      // 2. Subtract from user wallet
      const userRef = doc(db, 'users', showLiquidationModal.id);
      batch.update(userRef, {
        commissionWallet: increment(-liquidationForm.amount)
      });
      
      // 3. Create Notification
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        userId: showLiquidationModal.id,
        title: 'Pago Procesado',
        message: `Se ha procesado una liquidación de ${formatCurrency(liquidationForm.amount)} vía ${liquidationForm.paymentMethod}.`,
        type: 'info',
        read: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      alert('Liquidación procesada correctamente');
      setShowLiquidationModal(null);
      setLiquidationForm({ amount: 0, paymentMethod: 'transferencia', note: '' });
    } catch (error) {
      console.error('Liquidation error:', error);
      alert('Error al procesar la liquidación');
    } finally {
      setLiquidating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    console.log(`[AdminPanel] handleDeleteUser initiated for userId: ${userId}`);
    if (userId === profile.id) {
      console.warn('[AdminPanel] Attempted to delete self. Aborting.');
      return;
    }
    
    const confirmDelete = window.confirm('¿ESTÁ SEGURO? Esta acción eliminará permanentemente al colaborador del sistema y no se puede deshacer.');
    if (!confirmDelete) {
      console.log('[AdminPanel] Delete cancelled by user.');
      return;
    }

    setUserDeleting(userId);
    try {
      console.log(`[AdminPanel] Deleting document: users/${userId}`);
      await deleteDoc(doc(db, 'users', userId));
      console.log(`[AdminPanel] Document users/${userId} deleted successfully.`);
      alert('Colaborador eliminado exitosamente.');
    } catch (error: any) {
      console.error('[AdminPanel] Delete user error:', error);
      alert(`Error al eliminar colaborador: ${error.message || 'Error desconocido'}`);
    } finally {
      setUserDeleting(null);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: Role) => {
    console.log(`[AdminPanel] handleUpdateUserRole called: userId=${userId}, newRole=${newRole}, currentAdmin=${profile.id}`);
    
    if (userId === profile.id) {
      alert('No puedes cambiar tu propio rol.');
      return;
    }
    
    setUserUpdating(userId);
    try {
      const userRef = doc(db, 'users', userId);
      console.log(`[AdminPanel] Executing updateDoc on path: users/${userId}`);
      
      await updateDoc(userRef, {
        role: newRole,
        status: 'active',
        updatedBy: profile.id,
        updatedAt: serverTimestamp()
      });
      
      console.log(`[AdminPanel] updateDoc SUCCESS for ${userId}`);
      alert(`Usuario actualizado exitosamente a ${newRole === 'admin' ? 'ADMINISTRADOR' : 'COLABORADOR'}`);
    } catch (error: any) {
      console.error('[AdminPanel] updateDoc FAILED:', error);
      alert(`Error al actualizar el rol: ${error.message || 'Error desconocido'}`);
    } finally {
      setUserUpdating(null);
    }
  };

  const getUserStats = (userId: string) => {
    const userCredits = allCredits.filter(c => c.workerId === userId);
    const userLeads = allClients.filter(c => c.assignedTo === userId);
    const approvedCredits = userCredits.filter(c => c.status === 'approved');
    
    return {
      totalLeads: userLeads.length,
      totalCredits: userCredits.length,
      approvedCredits: approvedCredits.length,
      totalAmount: approvedCredits.reduce((sum, c) => sum + c.amount, 0),
      totalCommission: approvedCredits.reduce((sum, c) => sum + c.commission, 0),
    };
  };

  const globalStats = {
    totalApprovedAmount: allCredits.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0),
    totalCommissionPaid: allUsers.reduce((sum, u) => sum + (u.commissionWallet || 0), 0),
    totalUsers: allUsers.length,
    activeLeads: allClients.length,
  };

  const MONTHLY_GOAL = 30;

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-500/10 text-indigo-500 p-3 rounded-2xl border border-indigo-500/20">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight uppercase">Centro de Administración</h2>
              <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Configuración global y monitoreo</p>
            </div>
          </div>

          {!isSupport && (
            <div className="flex bg-black/40 p-1.5 rounded-xl border border-slate-800 self-start md:self-center overflow-x-auto max-w-full scrollbar-hide">
              <button 
                onClick={() => setActiveTab('approvals')}
                className={cn(
                  "px-4 md:px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'approvals' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-white"
                )}
              >
                <Award size={14} /> Solicitudes ({pendingCredits.length})
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={cn(
                  "px-4 md:px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'users' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-white"
                )}
              >
                <Users size={14} /> Equipo
              </button>
              <button 
                onClick={() => setActiveTab('stats')}
                className={cn(
                  "px-4 md:px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'stats' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-white"
                )}
              >
                <BarChart3 size={14} /> Progreso
              </button>
            </div>
          )}
        </div>

        {/* Global Summary mini-cards */}
        {!isSupport && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-black/20 p-4 rounded-xl border border-slate-800/50">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Volumen Total</div>
              <div className="text-lg font-black text-white">{formatCurrency(globalStats.totalApprovedAmount)}</div>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-slate-800/50">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Comisiones Pagadas</div>
              <div className="text-lg font-black text-emerald-400">{formatCurrency(globalStats.totalCommissionPaid)}</div>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-slate-800/50">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Equipo Activo</div>
              <div className="text-lg font-black text-indigo-400">{globalStats.totalUsers} Colab.</div>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-slate-800/50">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Leads en Gestión</div>
              <div className="text-lg font-black text-amber-400">{globalStats.activeLeads} Leads</div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'approvals' && (
          <motion.div 
            key="approvals"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {pendingCredits.map((credit) => (
              <motion.div 
                key={credit.id}
                layout
                className="bg-surface border border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group"
              >
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_#f59e0b]"></div>
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Solicitud Pendiente</span>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="text-3xl font-black text-white">{formatCurrency(credit.amount)}</div>
                    <div className="text-right">
                      <div className="text-[9px] text-slate-500 uppercase font-black">Comisión</div>
                      <div className="text-lg font-bold text-emerald-400">{formatCurrency(credit.commission)}</div>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-xl p-4 border border-slate-800/50 space-y-3">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Promotor</div>
                      <div className="text-[11px] font-semibold text-slate-200 truncate">
                        {allUsers.find(u => u.id === credit.workerId)?.displayName || credit.workerId}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Cliente DNI</div>
                      <div className="text-[11px] font-mono text-slate-200">{credit.clientId}</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleApproval(credit, 'approved')}
                      disabled={processingAction}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {processingAction ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Aprobar</>}
                    </button>
                    <button 
                      onClick={() => setShowRejectionModal(credit)}
                      disabled={processingAction}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50"
                    >
                      <X size={14} /> Rechazar
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            {pendingCredits.length === 0 && (
              <div className="col-span-full text-center py-24 bg-surface rounded-3xl border-2 border-dashed border-slate-800">
                <Award size={48} className="text-slate-800 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-500 uppercase tracking-widest">Sin solicitudes pendientes</h3>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'users' && (
          <>
            <motion.div 
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-surface border border-slate-800 rounded-2xl overflow-hidden"
            >
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[700px] md:min-w-0">
                <thead className="bg-black/20 border-b border-slate-800">
                  <tr>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Colaborador</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Leads</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Éxito (Apro.)</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Meta Mensual</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Volumen</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Billetera</th>
                    <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {allUsers.map((user) => {
                    const stats = getUserStats(user.id);
                    return (
                      <tr 
                        key={user.id} 
                        className="hover:bg-white/5 transition-colors group cursor-pointer"
                        onClick={() => setSelectedUserDetails(user.id)}
                      >
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0",
                              user.role === 'admin' ? "bg-indigo-500/20 text-indigo-400" : "bg-emerald-500/20 text-emerald-400"
                            )}>
                              {user.displayName?.charAt(0) || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white flex items-center gap-2 truncate">
                                {user.displayName}
                                {user.role === 'visit' && (
                                  <span className="bg-amber-500/10 text-amber-500 text-[8px] px-1.5 py-0.5 rounded border border-amber-500/20 italic shrink-0">PENDIENTE</span>
                                )}
                                {user.role === 'support' && (
                                  <span className="bg-blue-500/10 text-blue-500 text-[8px] px-1.5 py-0.5 rounded border border-blue-500/20 font-black shrink-0">SUPPORT</span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter truncate">{user.role} • {user.email}</div>
                                {user.dni && <div className="text-[9px] text-indigo-400 font-mono tracking-tighter">DNI: {user.dni}</div>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-xs font-bold text-slate-300 text-center">{stats.totalLeads} <span className="text-[9px] text-slate-500 block">leads</span></td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                             <span className="text-xs font-bold text-emerald-400">{stats.approvedCredits}</span>
                             <span className="text-[10px] text-slate-500 font-bold">/ {stats.totalCredits}</span>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <div className="w-24 md:w-32 space-y-1">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                              <span className="text-slate-400">{stats.approvedCredits} / {MONTHLY_GOAL}</span>
                              <span className="text-indigo-400">{Math.round((stats.approvedCredits / MONTHLY_GOAL) * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-900 rounded-full border border-slate-800 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((stats.approvedCredits / MONTHLY_GOAL) * 100, 100)}%` }}
                                className={cn(
                                  "h-full transition-all",
                                  stats.approvedCredits >= MONTHLY_GOAL ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-indigo-500"
                                )}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-xs font-bold text-indigo-400 font-mono tracking-tighter text-center">
                          {formatCurrency(stats.totalAmount)}
                        </td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          <div className="text-xs font-bold text-white font-mono tracking-tighter">{formatCurrency(user.commissionWallet || 0)}</div>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 md:gap-2">
                            {user.id !== profile.id && user.role === 'visit' ? (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleUpdateUserRole(user.id, 'worker')}
                                  disabled={userUpdating === user.id}
                                  className="text-[9px] font-black uppercase tracking-widest px-2 md:px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                                >
                                  {userUpdating === user.id ? '...' : (
                                    <><span className="md:hidden">Acep.</span><span className="hidden md:inline">Aceptar</span></>
                                  )}
                                </button>
                                <button 
                                  onClick={() => handleUpdateUserRole(user.id, 'support')}
                                  disabled={userUpdating === user.id}
                                  className="text-[9px] font-black uppercase tracking-widest px-2 md:px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                                >
                                  {userUpdating === user.id ? '...' : (
                                    <><span className="md:hidden">SUPP</span><span className="hidden md:inline">Support</span></>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5 md:gap-2">
                                {user.id !== profile.id && (
                                  <div className="flex gap-1.5">
                                    <button 
                                      onClick={() => handleUpdateUserRole(user.id, user.role === 'admin' ? 'worker' : 'admin')}
                                      disabled={userUpdating === user.id}
                                      className={cn(
                                        "text-[8px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded border transition-all disabled:opacity-50",
                                        user.role === 'admin' ? "border-amber-500/30 text-amber-500" : "border-indigo-500/30 text-indigo-400"
                                      )}
                                      title={user.role === 'admin' ? 'Quitar Admin' : 'Hacer Admin'}
                                    >
                                      {userUpdating === user.id ? '...' : (user.role === 'admin' ? 'Q.ADM' : 'H.ADM')}
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateUserRole(user.id, user.role === 'support' ? 'worker' : 'support')}
                                      disabled={userUpdating === user.id}
                                      className={cn(
                                        "text-[8px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded border transition-all disabled:opacity-50",
                                        user.role === 'support' ? "border-blue-500/30 text-blue-500" : "border-slate-700 text-slate-500"
                                      )}
                                      title={user.role === 'support' ? 'Quitar Support' : 'Hacer Support'}
                                    >
                                      {userUpdating === user.id ? '...' : (user.role === 'support' ? 'Q.SUP' : 'H.SUP')}
                                    </button>
                                  </div>
                                )}
                                
                                <button 
                                  onClick={() => setSelectedUserDetails(selectedUserDetails === user.id ? null : user.id)}
                                  className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded border transition-all flex items-center gap-1",
                                    selectedUserDetails === user.id
                                      ? "bg-amber-600 border-amber-500 text-white"
                                      : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                  )}
                                  title="Ver Detalles del Perfil"
                                >
                                  <User size={12} />
                                </button>
                                
                                <button 
                                  onClick={() => setSelectedUserLiquidations(selectedUserLiquidations === user.id ? null : user.id)}
                                  className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded border transition-all flex items-center gap-1",
                                    selectedUserLiquidations === user.id
                                      ? "bg-indigo-600 border-indigo-500 text-white"
                                      : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                  )}
                                  title="Historial de Pagos"
                                >
                                  <History size={12} />
                                </button>
                                
                                <button 
                                  onClick={() => setSelectedUserHistory(selectedUserHistory === user.id ? null : user.id)}
                                  className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded border transition-all",
                                    selectedUserHistory === user.id
                                      ? "bg-slate-700 border-slate-600 text-white"
                                      : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                  )}
                                  title="Historial de Créditos"
                                >
                                  <span className="md:hidden">HIS</span>
                                  <span className="hidden md:inline">Historial</span>
                                </button>

                                {(user.commissionWallet || 0) > 0 && (
                                  <button 
                                    onClick={() => {
                                      setShowLiquidationModal(user);
                                      setLiquidationForm({ ...liquidationForm, amount: user.commissionWallet });
                                    }}
                                    className="text-[9px] font-black uppercase tracking-widest px-1.5 md:px-2 py-1.5 rounded bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1"
                                    title="Liquidar"
                                  >
                                    <Wallet size={12} />
                                    <span className="hidden lg:inline">Pagar</span>
                                  </button>
                                )}

                                {user.id !== profile.id && (
                                  <button 
                                    onClick={() => handleDeleteUser(user.id)}
                                    disabled={userDeleting === user.id || userUpdating === user.id}
                                    className={cn(
                                      "text-[9px] font-black uppercase tracking-widest p-1.5 md:px-2 md:py-1.5 rounded bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50",
                                      userDeleting === user.id && "animate-pulse"
                                    )}
                                  >
                                    {userDeleting === user.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

            <AnimatePresence>
              {selectedUserDetails && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-1 border-b border-slate-800">
                      <div className="bg-slate-800/50 rounded-t-2xl px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                            <User className="text-white" size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1">Perfil del Colaborador</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Detalles administrativos y de contacto</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedUserDetails(null)}
                          className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="p-8">
                      {(() => {
                        const u = allUsers.find(user => user.id === selectedUserDetails);
                        if (!u) return null;
                        return (
                          <div className="space-y-8">
                            <div className="flex items-center gap-6 pb-8 border-b border-slate-800/50">
                              <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/20 flex items-center justify-center text-3xl font-black text-indigo-400">
                                {u.displayName?.charAt(0)}
                              </div>
                              <div className="flex-1">
                                <h1 className="text-2xl font-black text-white tracking-tight leading-tight">{u.displayName}</h1>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{u.role} • ID: {u.id.slice(0, 8)}</p>
                                <div className="mt-3 flex gap-2">
                                  {u.status === 'active' ? (
                                    <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20 uppercase">Cuenta Activa</span>
                                  ) : (
                                    <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full border border-amber-500/20 uppercase">En Revisión</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                              <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                  <Users size={12} className="text-indigo-400" /> Datos de Identidad
                                </p>
                                <div className="space-y-4">
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-600 block uppercase">Documento DNI</span>
                                    <span className="text-sm font-bold text-white font-mono italic underline decoration-indigo-500/30 underline-offset-4">{u.dni || 'No registrado'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-600 block uppercase">Correo Principal</span>
                                    <span className="text-sm font-bold text-white truncate block">{u.email}</span>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                  <ShieldCheck size={12} className="text-emerald-400" /> Contacto Directo
                                </p>
                                <div className="space-y-4">
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-600 block uppercase">WhatsApp</span>
                                    <span className="text-sm font-bold text-emerald-400">{u.whatsappNumber || 'No configurado'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-600 block uppercase">Teléfono Móvil</span>
                                    <span className="text-sm font-bold text-white">{u.phoneNumber || 'No configurado'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="col-span-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ubicación y Registro</p>
                                <div className="grid grid-cols-2 gap-8">
                                  <div>
                                    <span className="text-[9px] font-bold text-slate-600 block uppercase">Fecha de Ingreso</span>
                                    <span className="text-sm font-bold text-slate-300">
                                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
                                    </span>
                                  </div>
                                  {u.address && (
                                    <div className="col-span-2 md:col-span-1">
                                      <span className="text-[9px] font-bold text-slate-600 block uppercase">Dirección</span>
                                      <span className="text-sm font-bold text-slate-300">{u.address}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="bg-slate-950 p-6 flex justify-end gap-3 rounded-b-3xl">
                      <button 
                        onClick={() => setSelectedUserDetails(null)}
                        className="px-6 py-2 bg-slate-800 text-xs font-black text-white rounded-xl hover:bg-slate-700 transition-all uppercase tracking-widest shadow-lg"
                      >
                        Cerrar Perfil
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}

              {selectedUserHistory && (

                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-slate-800 bg-black/40 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={14} className="text-emerald-400" /> 
                        Créditos Cerrados: {allUsers.find(u => u.id === selectedUserHistory)?.displayName}
                      </h3>
                      <button 
                        onClick={() => setSelectedUserHistory(null)}
                        className="text-[10px] text-slate-500 hover:text-white uppercase font-black"
                      >
                        Cerrar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allCredits
                        .filter(c => c.workerId === selectedUserHistory && c.status === 'approved')
                        .map(credit => (
                          <div key={credit.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <div>
                              <div className="text-[10px] font-mono text-slate-400">DNI: {credit.clientId}</div>
                              <div className="text-sm font-black text-white">{formatCurrency(credit.amount)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] text-slate-500 uppercase font-bold">Comisión</div>
                              <div className="text-xs font-black text-emerald-400">{formatCurrency(credit.commission)}</div>
                            </div>
                          </div>
                        ))}
                      {allCredits.filter(c => c.workerId === selectedUserHistory && c.status === 'approved').length === 0 && (
                        <div className="col-span-full py-8 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">
                          No hay créditos aprobados registrados
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {selectedUserLiquidations && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-slate-800 bg-black/40 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <History size={14} className="text-indigo-400" /> 
                        Historial de Liquidaciones: {allUsers.find(u => u.id === selectedUserLiquidations)?.displayName}
                      </h3>
                      <button 
                        onClick={() => setSelectedUserLiquidations(null)}
                        className="text-[10px] text-slate-500 hover:text-white uppercase font-black"
                      >
                        Cerrar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {liquidations
                        .filter(l => l.userId === selectedUserLiquidations)
                        .map(liq => (
                          <div key={liq.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex justify-between items-start">
                            <div>
                              <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">{liq.paymentMethod}</div>
                              <div className="text-base font-black text-white">{formatCurrency(liq.amount)}</div>
                              <div className="mt-2 text-[10px] text-slate-400">
                                <span className="font-bold text-slate-500">Nota:</span> {liq.note || 'Sin nota'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-bold text-slate-500">
                                {liq.createdAt?.toDate()?.toLocaleString() || 'Reciente'}
                              </div>
                            </div>
                          </div>
                        ))}
                      {liquidations.filter(l => l.userId === selectedUserLiquidations).length === 0 && (
                        <div className="col-span-full py-8 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">
                          No hay liquidaciones registradas
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {activeTab === 'stats' && (
          <motion.div 
            key="stats"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-surface p-8 rounded-3xl border border-slate-800 flex flex-col items-center justify-center text-center">
                <PieChart size={64} className="text-emerald-500 mb-6 opacity-50" />
                <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Monitor de Crecimiento</h3>
                <p className="text-slate-500 text-xs mb-8">El sistema está operando al óptimo de leads disponibles.</p>
                
                <div className="flex gap-12">
                  <div className="text-center">
                    <div className="text-3xl font-black text-emerald-400 mb-1">{((globalStats.totalApprovedAmount / 1000000) * 100).toFixed(1)}%</div>
                    <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Meta Mensual</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-black text-indigo-400 mb-1">{(allClients.filter(c => c.status === 'closed').length / allClients.length * 100 || 0).toFixed(1)}%</div>
                    <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Tasa Conversión</div>
                  </div>
                </div>
              </div>

              <div className="bg-surface p-8 rounded-3xl border border-slate-800">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                  <TrendingUp size={16} className="text-indigo-400" /> Rendimiento Histórico
                </h3>
                <div className="space-y-4">
                  {[15, 25, 45, 65, 85].map((val, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-12 text-[10px] text-slate-500 font-bold uppercase">{['L', 'M', 'M', 'J', 'V'][i]}</div>
                      <div className="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${val}%` }}
                          className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                        />
                      </div>
                      <div className="w-10 text-[10px] font-mono text-indigo-400 font-bold">{val}k</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-surface p-8 rounded-3xl border border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Zona de Peligro Administrativa</h3>
                <p className="text-slate-500 text-[10px] mt-1">Solo use estas opciones si necesita reiniciar el entorno de pruebas.</p>
              </div>
              <button 
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-6 py-3 rounded-xl border border-red-500/20 transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 shadow-lg shadow-red-500/5 group"
              >
                <RefreshCw size={14} className={cn(resetting && 'animate-spin', "group-hover:rotate-180 transition-all duration-500")} />
                {resetting ? 'Procesando...' : 'Formatear y Sembrar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rejection Modal */}
      <AnimatePresence>
        {showRejectionModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 bg-black/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Rechazar Solicitud</h3>
                    <p className="text-[9px] text-slate-500 uppercase font-bold">Crédito por {formatCurrency(showRejectionModal.amount)}</p>
                  </div>
                </div>
                <button onClick={() => setShowRejectionModal(null)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Motivo del Rechazo</label>
                  <textarea 
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ej. Documentación incompleta, Cliente con mal historial, etc."
                    className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-red-500 transition-all min-h-[120px]"
                    autoFocus
                  />
                  <p className="text-[9px] text-slate-600 mt-2 italic">* Este motivo será notificado al agente que solicitó el crédito.</p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button 
                    onClick={() => setShowRejectionModal(null)}
                    disabled={processingAction}
                    className="flex-1 py-3 bg-black/40 hover:bg-black/60 text-slate-500 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleApproval(showRejectionModal, 'rejected', rejectionReason)}
                    disabled={processingAction || !rejectionReason.trim()}
                    className="flex-[2] py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-red-500/20 transition-all disabled:opacity-50"
                  >
                    {processingAction ? 'Procesando...' : 'Confirmar Rechazo'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Liquidation Modal */}
      <AnimatePresence>
        {showLiquidationModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 bg-black/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <Banknote size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Liquidar Billetera</h3>
                    <p className="text-[9px] text-slate-500 uppercase font-bold">{showLiquidationModal.displayName}</p>
                  </div>
                </div>
                <button onClick={() => setShowLiquidationModal(null)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Monto a Liquidar</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                    <input 
                      type="number"
                      value={liquidationForm.amount}
                      onChange={(e) => setLiquidationForm({ ...liquidationForm, amount: Number(e.target.value) })}
                      className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-8 pr-4 text-white font-black text-xl focus:outline-none focus:border-emerald-500 transition-all font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">Disponible: <span className="font-bold text-white">{formatCurrency(showLiquidationModal.commissionWallet)}</span></p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Método de Pago</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['efectivo', 'transferencia', 'yapeo'].map((method) => (
                      <button
                        key={method}
                        onClick={() => setLiquidationForm({ ...liquidationForm, paymentMethod: method as any })}
                        className={cn(
                          "py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                          liquidationForm.paymentMethod === method 
                            ? "bg-emerald-500 border-emerald-500 text-black"
                            : "bg-black/20 border-slate-800 text-slate-500 hover:border-slate-600"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Nota / Referencia</label>
                  <textarea 
                    value={liquidationForm.note}
                    onChange={(e) => setLiquidationForm({ ...liquidationForm, note: e.target.value })}
                    placeholder="Ej. Transferencia BCP, Pago quincenal..."
                    className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all min-h-[80px]"
                  />
                </div>

                <div className="pt-2">
                  <button 
                    onClick={handleLiquidate}
                    disabled={liquidating}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {liquidating ? 'Procesando...' : 'Confirmar Liquidación'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
