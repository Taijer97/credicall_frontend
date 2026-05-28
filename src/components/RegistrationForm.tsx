import React, { useState } from 'react';
import { 
  User, 
  MapPin, 
  Phone, 
  Calendar, 
  Lock, 
  IdCard, 
  Mail,
  ArrowRight, 
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  loading: boolean;
}

export function RegistrationForm({ onSubmit, onCancel, loading }: RegistrationFormProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    dni: '',
    birthDate: '',
    address: '',
    phoneNumber: '',
    whatsappNumber: '',
    useSameNumber: true,
    pin: '',
    confirmPin: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.pin !== formData.confirmPin) {
      alert('Los PINs no coinciden');
      return;
    }
    if (formData.pin.length !== 6) {
      alert('El PIN debe ser de 6 dígitos');
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all border",
              step === s ? "bg-emerald-600 border-emerald-500 text-white" : 
              step > s ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-500" :
              "bg-slate-900 border-slate-800 text-slate-500"
            )}>
              {step > s ? <CheckCircle2 size={14} /> : s}
            </div>
            {s < 3 && <div className="w-8 h-[2px] bg-slate-800" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {step === 1 && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Información Personal</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombres</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Apellidos</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Corporativo o Personal</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">DNI</label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  name="dni"
                  value={formData.dni}
                  onChange={handleChange}
                  maxLength={8}
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Nacimiento</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleChange}
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <button 
              type="button"
              onClick={nextStep}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
            >
              Siguiente <ArrowRight size={16} />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Contacto y Dirección</h3>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Dirección Actual</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Número de Celular</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox"
                  name="useSameNumber"
                  checked={formData.useSameNumber}
                  onChange={handleChange}
                  className="w-4 h-4 rounded border-slate-800 bg-black/40 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-300 uppercase tracking-wider">Usar el mismo número para WhatsApp</span>
              </label>

              {!formData.useSameNumber && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Número de WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
                    <input 
                      name="whatsappNumber"
                      value={formData.whatsappNumber}
                      onChange={handleChange}
                      className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                type="button"
                onClick={prevStep}
                className="py-4 border border-slate-800 hover:bg-slate-800/50 text-slate-400 font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} /> Anterior
              </button>
              <button 
                type="button"
                onClick={nextStep}
                className="py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10"
              >
                Siguiente <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Seguridad (PIN de 6 dígitos)</h3>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Crear PIN</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password"
                  name="pin"
                  value={formData.pin}
                  onChange={handleChange}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirmar PIN</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password"
                  name="confirmPin"
                  value={formData.confirmPin}
                  onChange={handleChange}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                type="button"
                onClick={prevStep}
                className="py-4 border border-slate-800 hover:bg-slate-800/50 text-slate-400 font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} /> Anterior
              </button>
              <button 
                type="submit"
                disabled={loading}
                className="py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 disabled:opacity-50"
              >
                {loading ? 'Registrando...' : 'Finalizar Registro'}
              </button>
            </div>
          </motion.div>
        )}
      </form>
      
      <button 
        type="button"
        onClick={onCancel}
        className="w-full py-2 text-[10px] text-slate-500 hover:text-slate-300 font-black uppercase tracking-[0.2em] transition-colors"
      >
        Volver al Inicio
      </button>
    </div>
  );
}
