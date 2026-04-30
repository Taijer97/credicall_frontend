import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  limit as firestoreLimit,
  doc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { type Client, type UserProfile } from '../types';
import { Users, TrendingUp, AlertCircle, Clock, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { StatsCard } from './StatsCard';
import { ClientTable } from './ClientTable';
import { ClientDetail } from './ClientDetail';
import { AdminPanel } from './AdminPanel';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';

export function Dashboard({ profile, externalSelectedClient }: { profile: UserProfile, externalSelectedClient?: Client | null }) {
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [apiLeads, setApiLeads] = useState<Client[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [offset, setOffset] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [nextApiOffset, setNextApiOffset] = useState(0);
  const [totalLeads] = useState(2138); // Specific total reported by user
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [view, setView] = useState<'leads' | 'admin'>('leads');

  const totalPages = Math.ceil(totalLeads / pageSize);

  useEffect(() => {
    if (externalSelectedClient) {
      setSelectedClient(externalSelectedClient);
    }
  }, [externalSelectedClient]);

  // Listen to Firestore changes
  useEffect(() => {
    const q = query(collection(db, 'clients'), firestoreLimit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setDbClients(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });
    return () => unsubscribe();
  }, []);

  const fetchApiLeads = useCallback(async (currentOffset: number, currentLimit: number) => {
    setLoadingLeads(true);
    try {
      const response = await fetch(`/api/ugel/data?limit=${currentLimit}&offset=${currentOffset}`);
      if (!response.ok) throw new Error('Error fetching API data');
      const result = await response.json();
      setApiLeads(result.leads || []);
      setHasMore(result.hasMore);
      setNextApiOffset(result.nextOffset);
    } catch (error) {
      console.error('API Fetch Error:', error);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    // Only refetch if search is empty or if we had an 8-digit search and it's no longer 8 digits
    const isSearchActive = searchQuery.length === 8 && /^\d+$/.test(searchQuery);
    const isSearchingName = searchQuery.length > 0 && !/^\d+$/.test(searchQuery);
    
    if (view === 'leads' && !isSearchActive && !isSearchingName) {
      // Small debounce could be added here if needed, but for now just fetch when stable
      fetchApiLeads(offset, pageSize);
    }
  }, [view, offset, pageSize, fetchApiLeads, searchQuery]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    // Only trigger DNI search if it's exactly 8 digits
    if (query.length === 8 && /^\d+$/.test(query)) {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/ugel/data/${query}`);
        if (!response.ok) throw new Error('Error searching DNI');
        const results = await response.json();
        
        if (results && results.length > 0) {
          setApiLeads(results);
          setHasMore(false);
        } else {
          // If not in API, check if it's already in our DB
          const localMatch = dbClients.find(c => c.dni === query);
          if (localMatch) {
            setApiLeads([localMatch]);
            setHasMore(false);
          } else {
            setApiLeads([]); // Not found anywhere
          }
        }
      } catch (error) {
        console.error('Search DNI error:', error);
      } finally {
        setIsSearching(false);
      }
    }
  };

  // Merge API data with Firestore states and deduplicate
  const processedLeads = apiLeads.reduce((acc: Client[], apiLead) => {
    if (!apiLead.dni || apiLead.dni === "0") return acc;
    if (acc.some(l => l.dni === apiLead.dni)) return acc;

    const dbMatch = dbClients.find(c => c.dni === apiLead.dni);
    const mergedLead = dbMatch 
      ? { ...apiLead, ...dbMatch, id: dbMatch.id || apiLead.dni } 
      : { ...apiLead, id: apiLead.dni };
      
    acc.push(mergedLead);
    return acc;
  }, []);

  const displayLeads = processedLeads.filter(lead => {
    if (!searchQuery) return true;
    
    const search = searchQuery.toLowerCase();
    const isNumericSearch = /^\d+$/.test(search);
    
    // If it's a numeric search of 8 digits, we already updated apiLeads
    if (isNumericSearch && search.length === 8) return true;
    
    // If it's numeric but not 8, don't filter locally (just wait)
    if (isNumericSearch && search.length < 8) return true;

    // Normal name search
    const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
    const reverseName = `${lead.lastName} ${lead.firstName}`.toLowerCase();
    return fullName.includes(search) || reverseName.includes(search) || lead.dni.includes(search);
  });

  const handlePageChange = (newPage: number) => {
    const newOffset = (newPage - 1) * pageSize;
    setOffset(newOffset);
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setOffset(0);
    setCurrentPage(1);
  };

  const statsData = [
    { label: 'Total Base', value: dbClients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Mis Leads', value: dbClients.filter(c => c.status === 'assigned' && c.assignedTo === profile.id).length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { label: 'Pendiente', value: formatCurrency(profile.pendingCommissions || 0), icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100' },
    { label: 'Billetera', value: formatCurrency(profile.commissionWallet || 0), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100' },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* View Switcher for Admins */}
        <div className="flex bg-surface p-1 rounded-xl border border-slate-800 w-full md:w-fit">
          <button 
            onClick={() => setView('leads')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'leads' ? 'bg-emerald-500 text-black shadow-md' : 'text-slate-500 hover:bg-white/5'}`}
          >
            Gestión
          </button>
          {(profile.role === 'admin' || profile.role === 'support') && (
            <button 
              onClick={() => setView('admin')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'admin' ? 'bg-emerald-500 text-black shadow-md' : 'text-slate-500 hover:bg-white/5'}`}
            >
              {profile.role === 'support' ? 'Solicitudes' : 'Administración'}
            </button>
          )}
        </div>

      {view === 'leads' ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 font-sans focus-mode-target" id="dashboard-stats-grid">
            {statsData.map((stat, i) => (
              <StatsCard 
                key={i} 
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                color={stat.color}
                bg={stat.bg}
              />
            ))}
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <h2 className="text-[10px] md:text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <RefreshCw className={cn("text-emerald-500", loadingLeads && "animate-spin")} size={14} />
                  Base UGEL
                </h2>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg">
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-500 uppercase">Ver:</span>
                    {[20, 50, 100].map(size => (
                      <button
                        key={size}
                        onClick={() => handlePageSizeChange(size)}
                        className={cn(
                          "text-[8px] md:text-[9px] font-bold px-1.5 py-0.5 rounded transition-all",
                          pageSize === size ? "bg-emerald-500 text-black" : "text-slate-400 hover:text-white"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  {/* Numeric Pagination */}
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1 || loadingLeads}
                      className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 disabled:opacity-20"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    
                    <div className="flex items-center gap-1 mx-1">
                       <span className="text-[10px] font-bold text-white px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                        {currentPage}
                       </span>
                       <span className="text-[10px] font-bold text-slate-600">/</span>
                       <span className="text-[10px] font-bold text-slate-500">{totalPages}</span>
                    </div>

                    <button 
                      onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                      disabled={loadingLeads || currentPage >= totalPages}
                      className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 disabled:opacity-20"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="hidden lg:block px-3 py-1.5 bg-black/40 border border-slate-800 rounded-lg text-[10px] font-black text-slate-400 min-w-[150px] text-center uppercase tracking-tighter">
                    Leads {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalLeads)} de {totalLeads}
                  </div>
                </div>
              </div>
              
              {loadingLeads && (
                <div className="flex items-center gap-2 text-emerald-500 animate-pulse bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10 self-start md:self-auto">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Sincronizando...</span>
                </div>
              )}
            </div>

            <ClientTable 
              clients={displayLeads} 
              onSelect={setSelectedClient} 
              currentUserId={profile.id}
              isAdmin={profile.role === 'admin'}
              onSearch={handleSearch}
              searchQuery={searchQuery}
              isSearching={isSearching}
            />
          </div>

          <AnimatePresence>
            {selectedClient && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
                {/* Backdrop */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedClient(null)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-full max-w-2xl h-full max-h-[85vh] bg-surface rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden shadow-emerald-500/5 sm:my-8"
                >
                  <ClientDetail 
                    client={selectedClient} 
                    onClose={() => setSelectedClient(null)} 
                    profile={profile}
                  />
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <AdminPanel profile={profile} />
      )}
    </div>
  );
}
