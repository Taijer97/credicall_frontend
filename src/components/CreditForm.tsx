import { useState, useEffect } from 'react';
import { type Client, type CreditAmount } from '../types';
import { X, Check, ShieldCheck, TrendingUp, Calendar, Calculator, Info, Loader2, RefreshCw, Search, Receipt, Share2, Copy } from 'lucide-react';
import { motion } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatCurrency, getCommission, cn } from '../lib/utils';

interface CreditFormProps {
  client: Client;
  workerId: string;
  onClose: () => void;
  previousDebt: number;
  previousInstallment: number;
  onConsultData: () => Promise<void>;
}

const CHARGE_MAP = {
  500: { min: 1600, max: 1900 },
  1000: { min: 3000, max: 3400 },
  1500: { min: 4400, max: 4600 }
};

export function CreditForm({ client, workerId, onClose, previousDebt, previousInstallment, onConsultData }: CreditFormProps) {
  const [selectedAmount, setSelectedAmount] = useState<CreditAmount>(500);
  const [customCharge, setCustomCharge] = useState<number>(CHARGE_MAP[500].max);
  const [dataConsulted, setDataConsulted] = useState(false);
  const [isConsulting, setIsConsulting] = useState(false);
  const [usePreviousInstallment, setUsePreviousInstallment] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number>(12);
  const [sending, setSending] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);

  const generateSummaryMessage = () => {
    const debtInfo = finalDebt > 0 ? ` (Incluye ${formatCurrency(finalDebt)} de deuda anterior)` : '';
    return `*RESUMEN DE CRÉDITO - WASITECH*\n\n` +
           `Hola *${client.firstName}*, aquí tienes el detalle de tu crédito:\n\n` +
           `💵 *Efectivo a recibir:* ${formatCurrency(selectedAmount)}\n` +
           `📈 *Total a Cobrar:* ${formatCurrency(totalCharge)}${debtInfo}\n` +
           `🗓️ *Plazo de Pago:* ${displayMonths} meses\n` +
           `💳 *Cuota Mensual:* ${formatCurrency(finalMonthlyFee)}\n\n` +
           `_Sujeto a verificación. Gracias por confiar en WasiTech._`;
  };

  const handleShare = () => {
    const text = encodeURIComponent(generateSummaryMessage());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSummaryMessage());
    setShowShareTooltip(true);
    setTimeout(() => setShowShareTooltip(false), 2000);
  };

  useEffect(() => {
    setCustomCharge(CHARGE_MAP[selectedAmount].max);
  }, [selectedAmount]);

  // Derived values
  const baseCharge = customCharge;
  const finalDebt = dataConsulted ? previousDebt : 0;
  const totalCharge = baseCharge + finalDebt;
  
  // Logic for Same Installment
  let displayMonths = selectedMonths;
  let finalMonthlyFee = totalCharge / selectedMonths;

  if (usePreviousInstallment && previousInstallment > 0) {
    displayMonths = Math.ceil(totalCharge / previousInstallment);
    finalMonthlyFee = previousInstallment;
  }

  const handleConsult = async () => {
    setIsConsulting(true);
    try {
      await onConsultData();
      setDataConsulted(true);
    } catch (error) {
      console.error('Error consulting data:', error);
    } finally {
      setIsConsulting(false);
    }
  };

  const handleSubmit = async () => {
    setSending(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Create Credit Document
      const creditRef = doc(collection(db, 'credits'));
      const creditData = {
        clientId: client.id,
        workerId,
        amount: selectedAmount,
        commission: getCommission(selectedAmount),
        status: 'pending',
        createdAt: serverTimestamp(),
        simulationDetails: {
          chargeType: customCharge === CHARGE_MAP[selectedAmount].min ? 'min' : (customCharge === CHARGE_MAP[selectedAmount].max ? 'max' : 'custom'),
          totalToPay: totalCharge,
          months: displayMonths,
          monthlyFee: finalMonthlyFee,
          previousDebtIncluded: finalDebt,
          mode: usePreviousInstallment ? 'keep_installment' : 'fixed_months'
        }
      };
      batch.set(creditRef, creditData);

      // 2. Fetch Admins to Notify
      const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminsSnapshot = await getDocs(adminsQuery);
      
      // 3. Create Notifications for Admins
      adminsSnapshot.docs.forEach(adminDoc => {
        const notificationRef = doc(collection(db, 'notifications'));
        batch.set(notificationRef, {
          userId: adminDoc.id,
          title: 'Nueva Solicitud de Crédito',
          message: `El agente ha solicitado un crédito de ${formatCurrency(selectedAmount)} para ${client.firstName} ${client.lastName}.`,
          type: 'warning',
          read: false,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      onClose();
    } catch (error) {
      console.error('Error submitting credit:', error);
      alert('Error al enviar la solicitud: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-surface border border-slate-800 shadow-2xl rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]"
      >
        <div className="flex-none p-5 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} />
            <h4 className="font-black text-xs uppercase tracking-[0.2em]">Simulador de Crédito</h4>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Step 1: Cash Amount */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Calculator size={14} />
              <span className="text-[10px] uppercase tracking-widest font-black">1. Monto en Efectivo</span>
            </div>
            <div className="flex gap-2">
              {[500, 1000, 1500].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setSelectedAmount(amt as CreditAmount)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl border-2 transition-all font-black text-xs",
                    selectedAmount === amt 
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]" 
                      : "border-slate-800 text-slate-500 hover:border-slate-700 bg-black/20"
                  )}
                >
                  {formatCurrency(amt)}
                </button>
              ))}
            </div>
          </section>

          {/* Step 2: Charge Adjustment */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500">
                <TrendingUp size={14} />
                <span className="text-[10px] uppercase tracking-widest font-black">2. Ajuste de Cobro</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400 font-mono">
                TOTAL: <span className="text-emerald-400">{formatCurrency(customCharge)}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="relative h-10 flex items-center group">
                {/* Background Track */}
                <div className="absolute inset-0 h-2 my-auto bg-slate-800 rounded-full border border-slate-700/50" />
                
                {/* Progress Fill */}
                <div 
                  className="absolute left-0 h-2 my-auto bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-200"
                  style={{ 
                    width: `${((customCharge - CHARGE_MAP[selectedAmount].min) / (CHARGE_MAP[selectedAmount].max - CHARGE_MAP[selectedAmount].min)) * 100}%` 
                  }}
                />

                {/* Input Slider */}
                <input 
                  type="range"
                  min={CHARGE_MAP[selectedAmount].min}
                  max={CHARGE_MAP[selectedAmount].max}
                  step={50}
                  value={customCharge}
                  onChange={(e) => setCustomCharge(parseInt(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                />

                {/* Thumb Indicator (Visual only) */}
                <div 
                  className="absolute w-5 h-5 bg-white rounded-full border-4 border-emerald-500 shadow-lg pointer-events-none transition-all duration-200"
                  style={{ 
                    left: `calc(${((customCharge - CHARGE_MAP[selectedAmount].min) / (CHARGE_MAP[selectedAmount].max - CHARGE_MAP[selectedAmount].min)) * 100}% - 10px)` 
                  }}
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 uppercase font-black">Mínimo</span>
                  <span className="text-[10px] text-slate-300 font-mono">{formatCurrency(CHARGE_MAP[selectedAmount].min)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] text-slate-500 uppercase font-black">Máximo</span>
                  <span className="text-[10px] text-slate-300 font-mono">{formatCurrency(CHARGE_MAP[selectedAmount].max)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Step 3: Debt Consultation & Installment Strategy */}
          <section className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-500">
                <Search size={14} />
                <span className="text-[10px] uppercase tracking-widest font-black">3. Validación y Deuda</span>
              </div>
              {!dataConsulted && (
                <button 
                  onClick={handleConsult}
                  disabled={isConsulting}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black font-black text-[9px] rounded-lg hover:bg-amber-400 transition-all uppercase tracking-tighter disabled:opacity-50"
                >
                  {isConsulting ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                  Consultar Datos
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/30 p-2 rounded-xl border border-slate-800">
                  <div className="text-[8px] text-slate-500 uppercase font-black">Deuda Detectada</div>
                  <div className={cn("text-xs font-mono", dataConsulted ? "text-slate-200" : "text-slate-600 animate-pulse")}>
                    {dataConsulted ? formatCurrency(previousDebt) : 'Esperando...'}
                  </div>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-slate-800">
                  <div className="text-[8px] text-slate-500 uppercase font-black">Cuota Anterior</div>
                  <div className={cn("text-xs font-mono", dataConsulted ? "text-slate-200" : "text-slate-600 animate-pulse")}>
                    {dataConsulted ? formatCurrency(previousInstallment) : 'Esperando...'}
                  </div>
                </div>
              </div>

              <div className={cn(
                "flex items-center justify-between p-2 rounded-xl transition-all border",
                dataConsulted && previousInstallment > 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-black/20 border-slate-800 opacity-60"
              )}>
                <div className="flex items-center gap-2">
                  <Receipt size={14} className={dataConsulted && previousInstallment > 0 ? "text-emerald-500" : "text-slate-600"} />
                  <div>
                    <span className="text-[10px] font-black text-slate-300 uppercase block">Mantener cuota anterior</span>
                    {dataConsulted && previousInstallment === 0 && (
                      <span className="text-[8px] text-amber-500 uppercase font-bold">Sin historial de cuotas</span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => dataConsulted && previousInstallment > 0 && setUsePreviousInstallment(!usePreviousInstallment)}
                  disabled={!dataConsulted || previousInstallment === 0}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all relative overflow-hidden",
                    usePreviousInstallment ? "bg-emerald-600" : "bg-slate-700",
                    (!dataConsulted || previousInstallment === 0) && "cursor-not-allowed opacity-50"
                  )}
                >
                  <motion.div 
                    animate={{ x: usePreviousInstallment ? 20 : 2 }}
                    className="absolute top-1 w-3 h-3 bg-white rounded-full"
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Step 4: Installments */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar size={14} />
              <span className="text-[10px] uppercase tracking-widest font-black">4. Plazo de Pago</span>
            </div>
            
            {usePreviousInstallment ? (
              <div className="bg-blue-500/10 border-2 border-blue-500/30 p-4 rounded-2xl flex items-center justify-between animate-in zoom-in-95 duration-200">
                <div>
                  <div className="text-[9px] text-blue-400 uppercase font-black mb-1">Cálculo Automático</div>
                  <div className="text-lg font-black text-white">{displayMonths} Meses</div>
                </div>
                <div className="text-[8px] text-slate-500 uppercase text-right leading-tight max-w-[100px]">
                  Total a pagar dividido entre la cuota anterior ({formatCurrency(previousInstallment)}), redondeado al mayor.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {[10, 12, 15, 18].map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonths(m)}
                    className={cn(
                      "py-2.5 rounded-xl border-2 transition-all font-black text-xs",
                      selectedMonths === m 
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" 
                        : "border-slate-800 text-slate-500 bg-black/20"
                    )}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Summary Box */}
          <div className="p-6 bg-emerald-500/10 rounded-3xl border-2 border-emerald-500/20 space-y-4 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
              <Calculator size={100} />
            </div>
            
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="text-[10px] text-emerald-500/60 uppercase font-black tracking-widest">
                  {usePreviousInstallment ? 'Cuota Ajustada (Mantenida)' : 'Pago Mensual Estimado'}
                </div>
                <div className="text-4xl font-black text-emerald-400 tracking-tighter">
                  {formatCurrency(finalMonthlyFee)}
                </div>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={handleCopy}
                  className="p-2 bg-black/40 hover:bg-black/60 rounded-xl text-emerald-400 transition-all active:scale-95 relative"
                  title="Copiar detalles"
                >
                  <Copy size={16} />
                  {showShareTooltip && (
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-[8px] font-black uppercase text-white px-2 py-1 rounded shadow-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-1">
                      Copiado!
                    </span>
                  )}
                </button>
                <button 
                  onClick={handleShare}
                  className="p-2 bg-emerald-500 text-black hover:bg-emerald-400 rounded-xl transition-all active:scale-95"
                  title="Compartir por WhatsApp"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-emerald-500/10 pt-4">
              <div>
                <div className="text-[9px] text-slate-500 uppercase font-black">Total a Cobrar</div>
                <div className="text-sm font-bold text-white">{formatCurrency(totalCharge)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500 uppercase font-black text-right text-emerald-500">Tu Comisión</div>
                <div className="text-sm font-bold font-mono text-right text-emerald-400">+{formatCurrency(getCommission(selectedAmount))}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-none p-6 bg-black/20 border-t border-slate-800 gap-3 flex flex-col sm:flex-row">
          <button
            onClick={handleShare}
            className="flex-1 py-4 bg-black/40 hover:bg-black/60 text-emerald-400 border border-emerald-500/30 font-black rounded-2xl transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest"
          >
            <Share2 size={16} />
            Enviar a Cliente
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="flex-[1.5] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-[0.2em] disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <Check size={18} strokeWidth={3} />
                Confirmar
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
