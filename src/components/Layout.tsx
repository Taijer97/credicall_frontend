import React, { useState, useEffect } from 'react';
import { type User } from 'firebase/auth';
import { type UserProfile, type Notification } from '../types';
import { LogOut, Sun, Moon, LayoutDashboard, Bell, Info, X, Check, Trash2, Clock } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  profile: UserProfile | null;
  onLogout: () => void;
  onProfileClick: () => void;
}

export function Layout({ children, user, profile, onLogout, onProfileClick }: LayoutProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const prevUnreadCount = React.useRef(0);
  const isMissingInfo = profile && (!profile.dni || !profile.phoneNumber);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
      // orderBy('createdAt', 'desc') // Temporarily disabled to check for index issues
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      // Sort by createdAt desc manually if orderBy is disabled
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      
      const unread = data.filter(n => !n.read).length;
      if (unread > prevUnreadCount.current) {
        // Play notification sound
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
      prevUnreadCount.current = unread;
      
      setNotifications(data);
    }, (error) => {
      console.error('Firestore Error in notifications listener:', error);
      // More detailed error for the platform to catch
      const errInfo = {
        error: error.message,
        operationType: 'list',
        path: 'notifications',
        authInfo: {
          userId: user?.uid,
          email: user?.email,
        }
      };
      console.error('DETAILED_ERROR:', JSON.stringify(errInfo));
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.read).forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return (
    <div className="min-h-screen bg-bg-app text-primary-text flex flex-col">
      {user && (
        <header className="sticky top-0 z-40 p-3 md:p-6 pb-0">
          <div className="max-w-7xl mx-auto bg-surface border border-slate-800 rounded-xl md:rounded-2xl px-4 md:px-6 py-2.5 md:py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <div className="w-7 h-7 md:w-10 md:h-10 bg-emerald-500 rounded-lg flex items-center justify-center text-black font-bold text-sm md:text-xl shrink-0">
                {profile?.role === 'admin' ? 'A' : profile?.role === 'support' ? 'S' : 'C'}
              </div>
              <div className="min-w-0">
                <h1 className="text-xs md:text-lg font-bold text-white leading-none truncate pr-2">CrediCall</h1>
                <span className="hidden md:inline text-[10px] text-slate-500 uppercase tracking-widest">Atención Crediticia</span>
                <span className="md:hidden text-[8px] text-slate-500 uppercase font-black">WasiTech</span>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-8 min-w-0">
              {profile && (
                <div className="flex items-center gap-2 md:gap-6">
                  {/* Icons Group */}
                  <div className="flex items-center gap-0.5 md:gap-2">
                    <div className="relative">
                      <button 
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={cn(
                          "p-1.5 transition-colors relative group",
                          showNotifications ? "text-emerald-400" : "text-slate-500 hover:text-emerald-400"
                        )}
                      >
                        <Bell size={18} className="md:w-5 md:h-5" />
                        {unreadCount > 0 && (
                          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-surface flex items-center justify-center text-[6px] text-black font-black">
                            {unreadCount > 9 ? '+' : unreadCount}
                          </span>
                        )}
                        {!showNotifications && (
                          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-800">
                            Notificaciones
                          </span>
                        )}
                      </button>

                      <AnimatePresence>
                        {showNotifications && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full right-0 mt-3 w-80 bg-surface border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden"
                          >
                            <div className="absolute -top-1.5 right-2 w-3 h-3 bg-surface border-t border-l border-slate-800 rotate-45"></div>
                            
                            <div className="p-4 border-b border-slate-800 bg-black/20 flex items-center justify-between">
                              <h3 className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">Notificaciones</h3>
                              {unreadCount > 0 && (
                                <button 
                                  onClick={markAllAsRead}
                                  className="text-[9px] text-slate-500 hover:text-white uppercase font-black tracking-tighter"
                                >
                                  Marcar todo como leído
                                </button>
                              )}
                            </div>

                            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-800 scrollbar-hide">
                              {notifications.length > 0 ? (
                                notifications.map((n) => (
                                  <div 
                                    key={n.id} 
                                    className={cn(
                                      "p-4 transition-colors group relative",
                                      n.read ? "opacity-60" : "bg-emerald-500/5"
                                    )}
                                  >
                                    <div className="flex gap-3">
                                      <div className={cn(
                                        "w-2 h-2 rounded-full shrink-0 mt-1.5",
                                        n.type === 'success' ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" :
                                        n.type === 'error' ? "bg-red-500 shadow-[0_0_8px_#ef4444]" :
                                        n.type === 'warning' ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" :
                                        "bg-blue-500 shadow-[0_0_8px_#3b82f6]"
                                      )} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-black text-white uppercase tracking-tight mb-0.5">{n.title}</p>
                                        <p className="text-[10px] text-slate-400 leading-relaxed mb-2 pr-6">{n.message}</p>
                                        <div className="flex items-center gap-2 text-[8px] text-slate-600 font-bold uppercase">
                                          <Clock size={8} />
                                          {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString() : 'Reciente'}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {!n.read && (
                                        <button 
                                          onClick={() => markAsRead(n.id)}
                                          className="p-1 hover:text-emerald-400 text-slate-500 transition-colors"
                                          title="Marcar como leído"
                                        >
                                          <Check size={12} />
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => deleteNotification(n.id)}
                                        className="p-1 hover:text-red-400 text-slate-500 transition-colors"
                                        title="Eliminar"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="p-8 text-center">
                                  <Bell size={24} className="text-slate-800 mx-auto mb-2" />
                                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">No hay notificaciones</p>
                                </div>
                              )}
                            </div>
                            
                            {notifications.length > 0 && (
                              <div className="p-3 bg-black/20 text-center border-t border-slate-800">
                                <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Fin de las notificaciones</span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    
                    <div className="relative">
                      <button 
                        onMouseEnter={() => setShowInfo(true)}
                        onMouseLeave={() => setShowInfo(false)}
                        onClick={() => setShowInfo(!showInfo)}
                        className={cn(
                          "p-1.5 transition-colors relative group",
                          showInfo ? "text-emerald-400" : "text-slate-500 hover:text-emerald-400"
                        )}
                      >
                        <Info size={18} className="md:w-5 md:h-5" />
                        {!showInfo && (
                          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-800">
                            Info Empresa
                          </span>
                        )}
                      </button>
                      
                      {showInfo && (
                        <div className="absolute top-full right-0 mt-3 w-64 bg-surface border border-slate-800 rounded-xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in duration-200">
                          <div className="absolute -top-1.5 right-2 w-3 h-3 bg-surface border-t border-l border-slate-800 rotate-45"></div>
                          <h3 className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">Información Corporativa</h3>
                          <div className="space-y-3">
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5">Empresa</p>
                              <p className="text-xs text-white font-bold">WasiTech</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5">RUC</p>
                              <p className="text-xs text-white font-bold">20615233731</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5">Asociada</p>
                              <p className="text-xs text-white font-bold">Cooperativa CB</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5">Ubicación</p>
                              <p className="text-xs text-white font-medium leading-relaxed">Jr Urubamba 423</p>
                              <p className="text-[9px] text-slate-400 italic mt-0.5 font-medium leading-tight">Ref: Frente a la agencia Aerolinea MAJORO</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5">Contactos</p>
                              <div className="flex flex-col gap-0.5">
                                <p className="text-xs text-emerald-400 font-bold tracking-tight">925763903</p>
                                <p className="text-xs text-emerald-400 font-bold tracking-tight">920438000</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 ml-1 md:ml-0">
                    <span className="text-[7px] md:text-[10px] text-slate-500 uppercase font-bold leading-none mb-0.5 md:mb-1">Saldo</span>
                    <span className="text-xs md:text-xl font-black text-emerald-400 leading-none">{formatCurrency(profile.commissionWallet)}</span>
                  </div>
                </div>
              )}
              
              <div className="hidden md:block h-10 w-[1px] bg-slate-800"></div>

              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-white truncate max-w-[100px]">{user.displayName}</p>
                  <p className={cn(
                    "text-[10px] font-bold uppercase",
                    profile?.role === 'admin' ? 'text-blue-400' : 
                    profile?.role === 'support' ? 'text-amber-400' : 'text-emerald-500'
                  )}>
                    {profile?.role === 'admin' ? 'Admin' : 
                     profile?.role === 'support' ? 'Support' : 'Agente'}
                  </p>
                </div>
                <button 
                  onClick={onProfileClick}
                  className="relative group transition-transform active:scale-95 shrink-0"
                >
                  <div className={cn(
                    "w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-white overflow-hidden transition-all group-hover:border-emerald-500/50 shrink-0",
                    isMissingInfo && "ring-2 ring-amber-500"
                  )}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-xs md:text-sm">{user.displayName?.charAt(0)}</span>
                    )}
                  </div>
                </button>
                <button
                  onClick={onLogout}
                  className="p-1.5 md:p-2 text-slate-500 hover:text-white transition-colors shrink-0"
                >
                  <LogOut size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </header>
      )}
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      <footer className="py-8 text-center text-slate-600 text-[10px] uppercase tracking-widest">
        &copy; {new Date().getFullYear()} WasiTech System • CALL-WT
      </footer>
    </div>
  );
}
