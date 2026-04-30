/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  type User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  getDocs,
  limit,
  writeBatch,
  where
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { Dashboard } from './components/Dashboard';
import { Layout } from './components/Layout';
import { RegistrationForm } from './components/RegistrationForm';
import { PendingAccess } from './components/PendingAccess';
import { ProfileModal } from './components/ProfileModal';
import { type UserProfile } from './types';
import { LogIn, ShieldCheck, User as UserIcon, Lock, Mail, AlertTriangle, Chrome, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// import { seedIfNeeded } from './lib/seed'; // Removed to stop auto-seeding

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [view, setView] = useState<'login' | 'register'>('login');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [targetClient, setTargetClient] = useState<UserProfile | any>(null);

  useEffect(() => {
    // Determine auth state first
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch profile when user changes
  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, 'users', user.uid);
    
    // Initial fetch
    const fetchProfile = async () => {
      try {
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setProfile({ id: user.uid, ...profileSnap.data() } as UserProfile);
        } else {
          // If no profile exists, stop loading so we don't hang
          console.warn('User logged in but no Firestore document found for uid:', user.uid);
          setProfile(null);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Listen for changes
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile({ id: user.uid, ...data });
        
        // Show missing info alert if data is incomplete
        const isMissing = !data.dni || !data.phoneNumber || !data.firstName || !data.lastName || !data.address;
        setShowAlert(isMissing);
      }
    }, (error) => {
      console.error('Snapshot error for profile:', error);
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    return () => unsubProfile();
  }, [user]);

  const handleGoogleAuth = async () => {
    setError(null);
    setAuthLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;

      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (!profileSnap.exists()) {
          // Check if this is the first user
          const usersSnapshot = await getDocs(query(collection(db, 'users'), limit(1)));
          const isFirstUser = usersSnapshot.empty;

          const batch = writeBatch(db);
          const newProfile: Omit<UserProfile, 'id'> = {
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
            role: isFirstUser ? 'admin' : 'visit',
            commissionWallet: 0,
            pendingCommissions: 0,
            status: isFirstUser ? 'active' : 'pending',
            createdAt: serverTimestamp()
          };
          
          batch.set(profileRef, newProfile);

          // Notify admins if not the first user
          if (!isFirstUser) {
            const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
            const adminsSnapshot = await getDocs(adminsQuery);
            adminsSnapshot.docs.forEach(adminDoc => {
              const notificationRef = doc(collection(db, 'notifications'));
              batch.set(notificationRef, {
                userId: adminDoc.id,
                title: 'Nuevo Registro',
                message: `El usuario ${newProfile.displayName} se ha registrado y espera aprobación.`,
                type: 'info',
                read: false,
                createdAt: serverTimestamp()
              });
            });
          }

          await batch.commit();
          setProfile({ id: firebaseUser.uid, ...newProfile } as UserProfile);
        }
      }
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (formData: any) => {
    setError(null);
    setAuthLoading(true);
    try {
      const loginEmail = formData.email;
      const loginPassword = formData.pin;

      // Check if DNI is already registered
      const dniQuery = query(collection(db, 'users'), where('dni', '==', formData.dni));
      const dniSnapshot = await getDocs(dniQuery);
      
      if (!dniSnapshot.empty) {
        setError('Este DNI ya está registrado en el sistema.');
        setAuthLoading(false);
        return;
      }

      const result = await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
      const firebaseUser = result.user;

      if (firebaseUser) {
        // Check if this is the first user
        const usersSnapshot = await getDocs(query(collection(db, 'users'), limit(1)));
        const isFirstUser = usersSnapshot.empty;

        const batch = writeBatch(db);
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const newProfile: Omit<UserProfile, 'id'> = {
          email: loginEmail,
          displayName: `${formData.firstName} ${formData.lastName}`,
          firstName: formData.firstName,
          lastName: formData.lastName,
          dni: formData.dni,
          birthDate: formData.birthDate,
          address: formData.address,
          phoneNumber: formData.phoneNumber,
          whatsappNumber: formData.useSameNumber ? formData.phoneNumber : formData.whatsappNumber,
          role: isFirstUser ? 'admin' : 'visit',
          commissionWallet: 0,
          pendingCommissions: 0,
          status: isFirstUser ? 'active' : 'pending',
          createdAt: serverTimestamp()
        };
        
        batch.set(profileRef, newProfile);

        // Notify admins
        if (!isFirstUser) {
          const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
          const adminsSnapshot = await getDocs(adminsQuery);
          adminsSnapshot.docs.forEach(adminDoc => {
            const notificationRef = doc(collection(db, 'notifications'));
            batch.set(notificationRef, {
              userId: adminDoc.id,
              title: 'Nuevo Registro de Agente',
              message: `El agente ${newProfile.displayName} ha completado su registro y espera aprobación.`,
              type: 'info',
              read: false,
              createdAt: serverTimestamp()
            });
          });
        }

        await batch.commit();
        setProfile({ id: firebaseUser.uid, ...newProfile } as UserProfile);
      }
    } catch (err: any) {
      console.error('Registration Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este DNI ya está registrado.');
      } else {
        setError(err.message || 'Error al registrar usuario');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setAuthLoading(true);

    let loginEmail = email;
    const loginPassword = password;

    // Handle DNI login (if input is 8 digits)
    if (/^\d{8}$/.test(loginEmail)) {
      loginEmail = `${loginEmail}@credicall.com`;
    }

    if (!loginEmail || !loginPassword) {
      setError('Por favor completa todos los campos.');
      setAuthLoading(false);
      return;
    }

    try {
      let firebaseUser;
      try {
        const result = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
        firebaseUser = result.user;
      } catch (err: any) {
        // If user doesn't exist, try to create it (for demo purposes)
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
          const result = await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
          firebaseUser = result.user;
        } else {
          throw err;
        }
      }

      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
            if (!profileSnap.exists()) {
              const newProfile: Omit<UserProfile, 'id'> = {
                email: loginEmail,
                displayName: loginEmail.split('@')[0],
                role: loginEmail.includes('admin') ? 'admin' : 'worker',
                commissionWallet: 0,
                pendingCommissions: 0,
                status: 'active',
                createdAt: serverTimestamp()
              };
              await setDoc(profileRef, newProfile);
              setProfile({ id: firebaseUser.uid, ...newProfile } as UserProfile);
            }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('El inicio de sesión con correo electrónico debe habilitarse en la consola de Firebase.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña es muy débil (mínimo 6 caracteres).');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo ya está en uso, pero la contraseña no coincide.');
      } else {
        setError(`Error: ${err.message || 'Credenciales incorrectas'}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <Layout 
      user={user} 
      profile={profile} 
      onLogout={handleLogout}
      onProfileClick={() => setShowProfileModal(true)}
    >
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div 
            key="auth-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center py-12 px-4"
          >
            <div className="bg-surface border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <ShieldCheck size={32} />
                </div>
                <h1 className="text-2xl font-black text-white uppercase tracking-widest">CrediCall WasiTech</h1>
                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">
                  {view === 'login' ? 'Acceso al Sistema Central' : 'Registro de Nuevo Usuario'}
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="text-red-500 shrink-0" size={18} />
                  <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">{error}</p>
                </div>
              )}

              {view === 'login' ? (
                <>
                  <form onSubmit={handleAuth} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email o DNI</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="text" 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email o DNI (8 dígitos)"
                          className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña / PIN</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="password" 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-600/10 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {authLoading ? 'Procesando...' : 'Entrar al Dashboard'}
                    </button>
                  </form>

                  <div className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center hover:opacity-100 transition-opacity">
                        <div className="w-full border-t border-slate-800"></div>
                      </div>
                      <div className="relative flex justify-center text-[9px] uppercase font-black text-slate-600 bg-surface px-4">
                        Otras Opciones
                      </div>
                    </div>

                    <button
                      onClick={handleGoogleAuth}
                      disabled={authLoading}
                      className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 font-black rounded-xl transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <Chrome size={18} className="text-blue-500" />
                      Continuar con Google
                    </button>

                    <button
                      onClick={() => setView('register')}
                      disabled={authLoading}
                      className="w-full py-3 border border-slate-800 hover:bg-slate-800/50 text-slate-400 font-black rounded-xl transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <UserIcon size={16} />
                      Registrar Nueva Cuenta
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-800">
                    {/* Simplified login view */}
                  </div>
                </>
              ) : (
                <RegistrationForm 
                  onSubmit={handleRegister} 
                  onCancel={() => setView('login')} 
                  loading={authLoading} 
                />
              )}
            </div>
          </motion.div>
        ) : profile ? (
          <div className="w-full">
            <AnimatePresence>
              {showAlert && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mb-8"
                >
                  <div className="max-w-7xl mx-auto">
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">Información Incompleta</p>
                          <p className="text-[9px] text-amber-500/80 font-bold uppercase tracking-widest leading-none mt-1">Completa tu perfil para acceder a todas las funciones del sistema.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowProfileModal(true)}
                        className="px-4 py-2 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                      >
                        Actualizar Ahora
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {profile.role === 'visit' ? (
              <PendingAccess profile={profile} onLogout={handleLogout} />
            ) : (
              <Dashboard 
                profile={profile} 
                externalSelectedClient={targetClient} 
              />
            )}

            <AnimatePresence>
              {showProfileModal && (
                <ProfileModal 
                  profile={profile} 
                  onClose={() => setShowProfileModal(false)} 
                  onSelectClient={(client) => {
                    setTargetClient(client);
                    setShowProfileModal(false);
                    // Reset targetClient after a short delay so Dashboard effect can re-trigger if needed
                    setTimeout(() => setTargetClient(null), 100);
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A0B] space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            {!loading && (
              <div className="text-center space-y-4">
                <p className="text-slate-500 text-xs uppercase tracking-widest font-black">Problema cargando perfil</p>
                <button 
                  onClick={handleLogout}
                  className="px-6 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 transition-all"
                >
                  Cerrar Sesión y Reintentar
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
