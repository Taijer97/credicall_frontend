import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Smartphone, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface WhatsAppQRModalProps {
  dni: string;
  onConnected: () => void;
  onClose: () => void;
}

type WhatsAppStatus = 'creando' | 'conectando' | 'pendiente' | 'conectado' | 'error';

export function WhatsAppQRModal({ dni, onConnected, onClose }: WhatsAppQRModalProps) {
  const [status, setStatus] = useState<string>('Iniciando...');
  const [statusType, setStatusType] = useState<WhatsAppStatus>('creando');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [lastQR, setLastQR] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_WHATSAPP_API_URL;

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    async function checkQR() {
      if (!isMounted) return;

      try {
        const res = await fetch(`/api/whatsapp/auth/${dni}`);
        const data = await res.json();

        if (data.status === "creando") {
          setStatus("Generando QR...");
          setStatusType("creando");
          setQrCode(null);
        } else if (data.status === "conectando") {
          setStatus("Esperando conexión...");
          setStatusType("conectando");
          setQrCode(null);
        } else if (data.status === "pendiente") {
          setStatus("Escanea el QR");
          setStatusType("pendiente");

          // Si hay un QR en la respuesta
          if (data.qr) {
            const formattedQR = data.qr.startsWith('data:') 
              ? data.qr 
              : `data:image/png;base64,${data.qr}`;

            // Si el QR cambió, parpadear brevemente como en el script original
            if (data.qr !== lastQR) {
              setLastQR(data.qr);
              setQrCode(null); // Ocultar para mostrar efecto de carga
              setTimeout(() => {
                if (isMounted) setQrCode(formattedQR);
              }, 500);
            } else if (!qrCode) {
              // Si no se está mostrando pero es el mismo, forzar mostrarlo
              setQrCode(formattedQR);
            }
          }
        } else if (data.status === "conectado") {
          setStatus("✅ Conectado");
          setStatusType("conectado");
          setQrCode(null);
          
          setTimeout(() => {
            if (isMounted) {
              onConnected();
              onClose();
            }
          }, 2000);
          return;
        } else if (data.error) {
          setStatus("❌ " + data.error);
          setStatusType("error");
          setError(data.error);
        }
      } catch (e) {
        console.error("ERROR:", e);
        setStatus("❌ Error de conexión");
        setStatusType("error");
      }

      timeoutId = setTimeout(checkQR, 2000);
    }

    checkQR();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [dni, lastQR, apiUrl, onConnected, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#0A0A0B] w-full max-w-md rounded-[32px] border border-slate-800 shadow-2xl overflow-hidden relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors z-10"
        >
          <X size={20} />
        </button>

        <div className="p-8 text-center">
          <div className="mb-8 mt-4">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-4 border border-emerald-500/20">
              <Smartphone size={32} />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">Registro WhatsApp</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">DNI del Trabajador: {dni}</p>
          </div>

          <div className="relative min-h-[300px] flex flex-col items-center justify-center bg-black/40 rounded-3xl border border-slate-800/50 p-6 mb-6">
            <AnimatePresence mode="wait">
              {qrCode ? (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="bg-white p-4 rounded-xl shadow-2xl"
                >
                  <img 
                    src={qrCode} 
                    alt="WhatsApp QR Code" 
                    className="w-64 h-64 select-none"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-12"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                    <RefreshCw className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={24} />
                  </div>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-tighter animate-pulse">
                    {statusType === 'creando' ? '🔄 Generando nuevo QR...' : 'Sincronizando estado...'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className={cn(
            "py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all border",
            statusType === 'conectado' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
            statusType === 'error' ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
            "bg-slate-800/50 border-slate-700/50 text-slate-300"
          )}>
            {statusType === 'conectado' ? <CheckCircle2 size={18} /> : 
             statusType === 'error' ? <AlertCircle size={18} /> : 
             <Loader2 size={18} className="animate-spin" />}
            <span className="text-xs font-black uppercase tracking-widest">{status}</span>
          </div>

          <p className="text-[9px] text-slate-500 uppercase font-black tracking-tighter mt-6 max-w-[250px] mx-auto">
            Abre WhatsApp en tu teléfono {'>'} Dispositivos vinculados {'>'} Vincular un dispositivo
          </p>
        </div>
      </motion.div>
    </div>
  );
}
