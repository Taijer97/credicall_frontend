import { useState, useEffect } from 'react';
import { 
  type Client, 
  type UserProfile, 
  type Interaction,
  type ExternalCredit,
  type ExternalCreditDetail,
  type ContactInfo
} from '../types';
import { 
  X, Phone, MessageSquare, Briefcase, DollarSign, 
  History, Plus, Send, PhoneCall, ExternalLink, ScrollText,
  CreditCard, UserCheck, CheckCircle, AlertCircle, TrendingUp, Award,
  Calendar, Receipt, Clock, Pin, User, Fingerprint, Search, Loader2,
  Smartphone, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CreditForm } from './CreditForm';
import { WhatsAppQRModal } from './WhatsAppQRModal';

interface ClientDetailProps {
  client: Client;
  onClose: () => void;
  profile: UserProfile;
}

export function ClientDetail({ client, onClose, profile }: ClientDetailProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [newNote, setNewNote] = useState('');
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [externalCredits, setExternalCredits] = useState<(ExternalCredit & { _raw?: any })[] | null>(null);
  const [detailedCredit, setDetailedCredit] = useState<ExternalCreditDetail | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo[] | null>(null);
  const [isFetchingContacts, setIsFetchingContacts] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [externalInstallmentSum, setExternalInstallmentSum] = useState<number>(0);
  const [isFetching, setIsFetching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const isAssignedToMe = client.assignedTo === profile.id;
  const apiUrl = import.meta.env.VITE_UGEL_API_URL;
  const whatsappApiUrl = import.meta.env.VITE_WHATSAPP_API_URL;

  const fetchCreditsFromApi = async () => {
    setIsFetching(true);
    setApiError(null);
    try {
      const response = await fetch(`/api/ugel/credits/${client.dni}`);
      const data = await response.json();
      
      if (data.warning) {
        setApiError(data.warning);
        setExternalCredits([]);
        return;
      }

      if (data.creditos && Array.isArray(data.creditos)) {
        const summary = data.creditos.map((c: any) => ({
          credit_num: c.credit_num,
          fecha_credito: c.detalle.fecha_credito,
          monto_credito: c.detalle.monto_credito,
          deuda: c.detalle.deuda,
          _raw: c
        }));
        setExternalCredits(summary);
      } else {
        setApiError("No se encontraron registros de crédito.");
      }
    } catch (error) {
      console.error("Fetch credit error:", error);
      setApiError("Error al consultar el sistema de créditos.");
    } finally {
      setIsFetching(false);
    }
  };

  const fetchContacts = async () => {
    if (!profile.dni) {
      alert("Debes configurar tu DNI en tu perfil para usar esta función.");
      return;
    }

    setIsFetchingContacts(true);
    try {
      // 1. Check if WhatsApp is connected
      const qrRes = await fetch(`/api/whatsapp/auth/${profile.dni}`);
      const qrData = await qrRes.json();

      if (qrData.status !== "conectado") {
        setShowQRModal(true);
        setIsFetchingContacts(false);
        return;
      }

      // 2. If connected, proceed to verify
      const response = await fetch(`/api/whatsapp/verify?dni_verify=${profile.dni}&dni=${client.dni}`);
      const data = await response.json();
      
      if (data.resultados && Array.isArray(data.resultados)) {
        setContactInfo(data.resultados);
      } else {
        alert("No se encontraron datos de contacto o el servicio está ocupado.");
      }
    } catch (error) {
      console.error("Fetch contacts error:", error);
      alert("Error al consultar contactos. Asegúrate de que el servicio esté activo.");
    } finally {
      setIsFetchingContacts(false);
    }
  };

  const selectCreditDetail = (summaryItem: any) => {
    const raw = summaryItem._raw;
    if (!raw) return;

    // Transform API history to timeline format
    const timeline: any = {};
    if (raw.historial && raw.historial.items) {
      Object.keys(raw.historial.items).forEach(month => {
        timeline[month] = {
          amount: raw.historial.items[month],
          status: raw.historial.statuses[month] || '⚪'
        };
      });
    }

    const detail: ExternalCreditDetail = {
      ...raw.detalle,
      timeline
    };
    
    setDetailedCredit(detail);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'clients', client.id, 'interactions'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setInteractions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction)));
    });
  }, [client.id]);

  const addInteraction = async (type: 'call' | 'whatsapp', result: string) => {
    await addDoc(collection(db, 'clients', client.id, 'interactions'), {
      clientId: client.id,
      workerId: profile.id,
      type,
      result,
      notes: newNote,
      createdAt: serverTimestamp()
    });
    setNewNote('');
  };

  const updateStatus = async (status: Client['status']) => {
    await updateDoc(doc(db, 'clients', client.id), {
      status,
      updatedAt: serverTimestamp()
    });
  };

  const handleSimulatorDataConsult = async () => {
    setIsFetching(true);
    try {
      const response = await fetch(`/api/ugel/credits/${client.dni}`);
      const data = await response.json();
      
      let installmentSum = 0;
      let summary: (ExternalCredit & { _raw?: any })[] = [];

      if (data.creditos && Array.isArray(data.creditos)) {
        summary = data.creditos.map((c: any) => ({
          credit_num: c.credit_num,
          fecha_credito: c.detalle.fecha_credito,
          monto_credito: c.detalle.monto_credito,
          deuda: c.detalle.deuda,
          _raw: c
        }));
        
        data.creditos.forEach((c: any) => {
          installmentSum += Number(c.detalle.cuota_mensual_estimada) || 0;
        });

        setExternalCredits(summary);
      } else if (data.warning) {
        setApiError(data.warning);
        setExternalCredits([]);
      }
      
      setExternalInstallmentSum(installmentSum);
    } catch (error) {
      console.error("Error consulting credits for simulator:", error);
    } finally {
      setIsFetching(false);
    }
  };

  const whatsappLink = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`;

  const copyCreditInfo = () => {
    if (!detailedCredit) return;

    let text = `📋 *INFORME DE CRÉDITO*\n`;
    text += `👤 *Cliente:* ${detailedCredit.nombre}\n`;
    text += `🆔 *DNI:* ${detailedCredit.dni}\n`;
    text += `🔢 *Crédito:* #${detailedCredit.credit_num}\n`;
    text += `📅 *Fecha:* ${formatDate(detailedCredit.fecha_credito)}\n`;
    text += `💰 *Monto Crédito:* ${formatCurrency(detailedCredit.monto_credito)}\n`;
    text += `🔥 *Deuda Real:* ${formatCurrency(detailedCredit.deuda)}\n`;
    text += `✅ *Monto Descontado:* ${formatCurrency(detailedCredit.monto_descontado)}\n`;
    text += `🕒 *Cuotas Pendientes:* ${detailedCredit.cuotas_pendientes}\n`;
    text += `⚠️ *Cuotas Atrasadas:* ${detailedCredit.cuotas_atrasadas}\n`;
    text += `📈 *Cuota Mensual Est.:* ${formatCurrency(detailedCredit.cuota_mensual_estimada)}\n`;
    text += `📌 *Estado Actual (${detailedCredit.mes_actual}):* ${detailedCredit.estado_mes_actual}\n\n`;

    text += `🗓️ *HISTORIAL DE PAGOS:*\n`;
    Object.entries(detailedCredit.timeline).forEach(([month, data]: [string, any]) => {
      text += `- ${month}: ${data.status} ${typeof data.amount === 'number' ? formatCurrency(data.amount) : data.amount}\n`;
    });

    navigator.clipboard.writeText(text);
    alert('Información copiada al portapapeles');
  };

  const totalExternalDebt = externalCredits?.reduce((acc, c) => acc + (c.deuda || 0), 0) || 0;
  // If we have external credits summary, prioritize the sum of all debts (Consolidation)
  const debtToPass = totalExternalDebt || detailedCredit?.deuda || client.financialData?.currentBalance || 0;

  const prevInstallment = externalInstallmentSum || detailedCredit?.cuota_mensual_estimada || client.financialData?.monthlyInstallment || 0;

  return (
    <div className="bg-surface flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex-none p-4 border-b border-slate-800 flex items-center justify-between bg-primary text-white">
        <div className="flex items-center gap-2">
          <ScrollText size={16} className="text-slate-400" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Expediente de Cliente</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8 scrollbar-thin scrollbar-thumb-slate-800">
        {/* Profile Card */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-800 text-emerald-500 rounded-full flex items-center justify-center font-bold text-xl uppercase border border-slate-700 shrink-0">
                {client.lastName[0]}{client.firstName[0]}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <div className="font-bold text-lg md:text-xl text-white uppercase truncate">{client.lastName} {client.firstName}</div>
                  {(() => {
                    const getQ = () => {
                      if (!client.financialData) return { label: 'POTENCIAL', classes: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                      if (client.financialData.paidInstallments >= 3 && client.financialData.currentMonthPaid) 
                        return { label: 'APTO', classes: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                      return { label: 'NO APTO', classes: 'bg-red-500/10 text-red-500 border-red-500/20' };
                    };
                    const q = getQ();
                    return (
                      <span className={cn("px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-widest", q.classes)}>
                        {q.label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-[10px] md:text-xs text-slate-500 mt-0.5 italic">DNI: {client.dni} • Sexo: {client.sex === 'M' ? 'Masculino' : 'Femenino'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {client.phones.map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-black/20 rounded-lg border border-slate-800/50">
                <span className="text-xs md:text-sm font-medium text-slate-300 font-mono">{p.number}</span>
                {p.hasWhatsapp ? (
                  <a href={whatsappLink(p.number)} target="_blank" rel="noopener noreferrer" className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white p-1 rounded transition-colors" title="Abrir WhatsApp">
                    <MessageSquare size={14} />
                  </a>
                ) : (
                  <div className="text-slate-600 p-1" title="Teléfono / Celular">
                    <Smartphone size={14} />
                  </div>
                )}
                <a href={`tel:${p.number}`} className="text-blue-400 hover:text-blue-300 p-1 hover:bg-blue-500/10 rounded transition-colors" title="Llamar">
                  <Phone size={14} />
                </a>
              </div>
            ))}
            <button 
              onClick={fetchContacts}
              disabled={isFetchingContacts}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg border border-indigo-500/20 text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
            >
              <Search size={14} className={isFetchingContacts ? 'animate-spin' : ''} />
              {isFetchingContacts ? 'Consultando...' : 'Números'}
            </button>
          </div>

          {contactInfo && (
            <div className="mt-4 bg-slate-900/50 rounded-xl border border-slate-800 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Números Detectados</h4>
                <button onClick={() => setContactInfo(null)} className="text-[10px] text-slate-500 hover:text-white uppercase font-bold">X</button>
              </div>
              <div className="grid gap-2">
                {contactInfo.map((contact, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-black/40 rounded-lg border border-slate-800/50 group hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="text-emerald-500/50">
                        {contact.whatsapp === 'SI' ? <MessageSquare size={16} /> : <Smartphone size={16} />}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white font-mono">{contact.numero}</div>
                        <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                          {contact.whatsapp === 'SI' ? 'WhatsApp Activo' : 'Línea Telefónica'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                         href={`tel:${contact.numero}`}
                         className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded transition-all"
                         title="Llamar"
                      >
                        <Phone size={14} />
                      </a>
                      {contact.whatsapp === 'SI' && (
                        <a 
                          href={whatsappLink(contact.numero)} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="p-1 px-2.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded text-[10px] uppercase font-black transition-all flex items-center gap-1.5"
                        >
                          <MessageSquare size={12} />
                          WA
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status Control */}
        {isAssignedToMe && (
          <div className="p-4 bg-black/20 border border-slate-800 rounded-xl space-y-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gestión de Estado</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <button onClick={() => updateStatus('interested')} className={cn("text-[9px] md:text-[10px] py-2 md:py-1.5 rounded-lg uppercase font-black tracking-tighter transition-all", client.status === 'interested' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500")}>Interesado</button>
              <button onClick={() => updateStatus('thinking')} className={cn("text-[9px] md:text-[10px] py-2 md:py-1.5 rounded-lg uppercase font-black tracking-tighter transition-all", client.status === 'thinking' ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500")}>Pensarlo</button>
              <button onClick={() => updateStatus('not_interested')} className={cn("text-[9px] md:text-[10px] py-2 md:py-1.5 rounded-lg uppercase font-black tracking-tighter transition-all", client.status === 'not_interested' ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500")}>Descartar</button>
              <button 
                onClick={() => setShowCreditForm(true)} 
                disabled={client.status === 'closed'}
                className={cn(
                  "text-[9px] md:text-[10px] py-2 md:py-1.5 rounded-lg uppercase font-black tracking-tighter transition-all",
                  client.status === 'closed' 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50" 
                    : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
                )}
              >
                Solicitar
              </button>
            </div>
          </div>
        )}

        {/* Sections */}
        <section className="space-y-4">
          <div className="bg-black/20 p-4 rounded-xl border border-slate-800/50">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">Datos Laborales</h3>
            {client.laborData ? (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-y-3 gap-x-4">
                <div className="col-span-2 md:col-span-1">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Institución Educativa</div>
                  <div className="text-xs md:text-sm text-slate-200 line-clamp-1">{client.laborData.company}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Estado</div>
                  <div className="text-xs md:text-sm text-emerald-400 font-semibold capitalize">{client.laborData.laborStatus}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Cod. Modular</div>
                  <div className="text-xs md:text-sm font-mono text-slate-300">{client.laborData.modularCode}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Cese</div>
                  <div className="text-xs md:text-sm text-slate-200">{formatDate(client.laborData.endDate) || 'N/A'}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No hay datos laborales registrados.</div>
            )}
          </div>
        </section>

        {/* Consultar Créditos Button - REPLACES static FinancialData if not consulted */}
        {!externalCredits && !detailedCredit && !apiError && (
          <div className="space-y-4">
            <button 
              onClick={fetchCreditsFromApi}
              disabled={isFetching}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3 uppercase text-xs tracking-widest disabled:opacity-50"
            >
              {isFetching ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <Search size={20} />
                  Consultar Créditos en Sistema
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-500 text-center uppercase font-bold tracking-tighter">Consulta saldo y deuda real vía API externa</p>
          </div>
        )}

        {/* API Error/Warning Message */}
        {apiError && !detailedCredit && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-200">
            <AlertCircle size={20} className="text-amber-500 shrink-0" />
            <div className="text-xs font-bold uppercase tracking-wider">{apiError}</div>
          </div>
        )}

        {/* Results of Consultation */}
        {externalCredits && externalCredits.length > 0 && !detailedCredit && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-white mb-2">
              <span className="text-xl">📊</span>
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-200">Total créditos: {externalCredits.length}</h4>
            </div>
            <div className="grid gap-3">
              {externalCredits.map((c) => (
                <button
                  key={c.credit_num}
                  onClick={() => selectCreditDetail(c)}
                  disabled={isFetching}
                  className="w-full bg-slate-900 border-2 border-slate-700 hover:border-emerald-500/50 p-4 rounded-2xl text-left transition-all group relative overflow-hidden"
                >
                  <div className="absolute right-0 top-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
                    <Search size={40} />
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="text-sm">🔎</span> Crédito #{c.credit_num}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 font-mono">{formatDate(c.fecha_credito)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-black">Monto</div>
                      <div className="text-sm font-bold text-slate-200">{formatCurrency(c.monto_credito)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-black text-right">Deuda Real</div>
                      <div className="text-sm font-bold text-amber-500 text-right">{formatCurrency(c.deuda)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Detailed Credit View (Telegram style) */}
        {detailedCredit && (
          <section className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <button 
                onClick={() => setDetailedCredit(null)}
                className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1 hover:text-blue-300 transition-colors"
              >
                <Plus size={14} className="rotate-45" /> Volver a lista
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={copyCreditInfo}
                  className="text-[10px] font-black bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 rounded-lg uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 hover:text-white transition-all shadow-lg shadow-emerald-500/10"
                >
                  <Copy size={12} /> Copiar Informe
                </button>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic flex items-center">
                  #{detailedCredit.credit_num}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-2xl border-2 border-slate-700 shadow-xl overflow-hidden font-mono">
              <div className="p-6 space-y-3 text-sm">
                <div className="flex items-center gap-3 text-slate-300">
                  <TrendingUp size={18} className="text-blue-400" />
                  <span className="font-bold">📊 Total créditos: {detailedCredit.total_credits}</span>
                </div>
                
                <div className="flex items-center gap-3 text-slate-300">
                  <Fingerprint size={18} className="text-purple-400" />
                  <span>DNI: {detailedCredit.dni}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <User size={18} className="text-amber-400" />
                  <span>Nombre: <span className="uppercase text-xs">{detailedCredit.nombre}</span></span>
                </div>

                <div className="flex items-center gap-3 text-slate-300 border-t border-slate-800 pt-3">
                  <Calendar size={18} className="text-slate-400" />
                  <span>Fecha crédito: {formatDate(detailedCredit.fecha_credito)}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <CreditCard size={18} className="text-slate-400" />
                  <span>Monto crédito: {formatCurrency(detailedCredit.monto_credito)}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <DollarSign size={18} className="text-amber-500" />
                  <span>Deuda real: {formatCurrency(detailedCredit.deuda)}</span>
                </div>

                <div className="flex items-center gap-3 text-emerald-400 font-bold">
                  <CheckCircle size={18} />
                  <span>Monto descontado: {formatCurrency(detailedCredit.monto_descontado)}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300 border-t border-slate-800 pt-3">
                  <Receipt size={18} className="text-slate-400" />
                  <span>Pagos reg: {detailedCredit.pagos_reg}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <Clock size={18} className="text-amber-400" />
                  <span>Cuotas pendientes: {detailedCredit.cuotas_pendientes}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <AlertCircle size={18} className="text-red-500" />
                  <span>Cuotas atrasadas: {detailedCredit.cuotas_atrasadas}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <TrendingUp size={18} className="text-emerald-500" />
                  <span>Cuota mensual est.: {formatCurrency(detailedCredit.cuota_mensual_estimada)}</span>
                </div>

                <div className="flex items-center gap-3 text-white font-bold bg-white/5 p-2 rounded-lg border border-white/10 mt-4">
                  <Pin size={18} className={detailedCredit.estado_mes_actual === 'NO DESCUENTO' ? 'text-red-500' : 'text-emerald-500'} />
                  <span>Mes actual ({detailedCredit.mes_actual}): <span className={detailedCredit.estado_mes_actual === 'NO DESCUENTO' ? 'text-red-400' : 'text-emerald-400'}>
                    {isNaN(parseFloat(detailedCredit.estado_mes_actual)) 
                      ? detailedCredit.estado_mes_actual 
                      : formatCurrency(detailedCredit.estado_mes_actual)}
                  </span></span>
                </div>
              </div>

              {/* Enhanced Payment History Section */}
              <div className="mx-4 mb-6 space-y-3">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Historial de Pagos</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Al día</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Deuda</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(detailedCredit.timeline).map(([month, data]: [string, any], idx) => {
                    const getStatusStyle = (status: string) => {
                      switch (status) {
                        case '🟢': return 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400';
                        case '🔴': return 'bg-red-500/5 border-red-500/20 text-red-400';
                        case '🟡': return 'bg-amber-500/5 border-amber-500/20 text-amber-400';
                        default: return 'bg-slate-800/30 border-slate-800 text-slate-500';
                      }
                    };
                    const style = getStatusStyle(data.status);
                    
                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "p-3 rounded-xl border transition-all flex flex-col gap-1",
                          style
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">{month}</span>
                          <span className="text-xs">{data.status}</span>
                        </div>
                        <div className="text-[11px] font-mono font-bold">
                          {typeof data.amount === 'number' ? formatCurrency(data.amount) : data.amount}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Interaction Log */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-white">
              <History size={16} className="text-slate-500" />
              <h4 className="font-bold text-[10px] uppercase tracking-widest">Interacciones</h4>
            </div>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full font-bold text-slate-400 uppercase">{interactions.length}</span>
          </div>

          {isAssignedToMe && (
            <div className="space-y-2">
              <textarea 
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escribe una nota interna..."
                className="w-full p-3 bg-black/20 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none h-20"
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => addInteraction('whatsapp', 'Enviado')}
                  disabled={!newNote.trim()}
                  className="flex-1 py-1.5 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1 border border-emerald-500/20"
                >
                  <MessageSquare size={12} /> Note & WA
                </button>
                <button 
                  onClick={() => addInteraction('call', 'Realizada')}
                  disabled={!newNote.trim()}
                  className="flex-1 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1 border border-blue-500/20"
                >
                  <Phone size={12} /> Note & Call
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {interactions.map((int) => (
              <div key={int.id} className="relative pl-4 border-l-2 border-slate-800 py-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                    int.type === 'whatsapp' ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                  )}>
                    {int.type}
                  </span>
                  <span className="text-[10px] text-slate-500">{int.createdAt?.toDate().toLocaleTimeString()}</span>
                </div>
                <div className="text-[11px] text-slate-300 bg-black/10 p-2 rounded-lg italic border border-slate-800/30">
                  {int.notes}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showCreditForm && (
        <CreditForm 
          client={client} 
          workerId={profile.id} 
          onClose={() => setShowCreditForm(false)} 
          previousDebt={debtToPass}
          previousInstallment={prevInstallment}
          onConsultData={handleSimulatorDataConsult}
        />
      )}

      <AnimatePresence>
        {showQRModal && (
          <WhatsAppQRModal 
            dni={profile.dni || ''}
            onConnected={fetchContacts}
            onClose={() => setShowQRModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
