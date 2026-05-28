import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import https from "https";

// Helper to parse Python-like literals (tuples/lists with datetime)
function smartParse(val: any) {
  if (!val) return val;
  
  // If it's already an array but of strings, try to parse each string
  if (Array.isArray(val)) {
    // Check if it's an array of strings that look like tuples
    if (val.length > 0 && typeof val[0] === 'string' && (val[0].trim().startsWith('(') || val[0].trim().startsWith('['))) {
      return val.map(item => smartParse(item));
    }
    // If it's already an array of non-strings (e.g. objects), return it
    if (val.length > 0 && typeof val[0] !== 'string') return val;
  }
  
  // If it's a single string that looks like a tuple "(...)"
  if (typeof val === 'string') {
    let s = val.trim();
    
    // Remove potential noise at the beginning (like "Result: (...")
    const tupleStart = s.indexOf('(');
    const listStart = s.indexOf('[');
    const startIdx = (tupleStart !== -1 && (listStart === -1 || tupleStart < listStart)) ? tupleStart : listStart;
    
    if (startIdx !== -1) {
      s = s.substring(startIdx);
    } else {
      return val; // Not a tuple/list string
    }
    
    try {
      // 1. Convert datetime.datetime(Y, M, D, ...) to "Y-M-D"
      let cleaned = s.replace(/datetime\.datetime\(\s*(\d+),\s*(\d+),\s*(\d+).*?\)/g, '"$1-$2-$3"');
      // 2. Replace single quotes with double quotes for JSON compatibility
      cleaned = cleaned.replace(/'/g, '"');
      // 3. Convert outer parentheses to brackets for array parsing
      if (cleaned.startsWith('(')) {
        // Find matching closing parenthesis
        const lastParen = cleaned.lastIndexOf(')');
        if (lastParen !== -1) {
          cleaned = '[' + cleaned.substring(1, lastParen) + ']';
        } else {
          cleaned = '[' + cleaned.substring(1) + ']';
        }
      }
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn("JSON.parse failed on cleaned tuple string, falling back to regex split", e.message);
      // Fallback manual split for cases where JSON.parse still fails
      // We strip the outer (), split by comma, and clean quotes
      const inner = s.trim().replace(/^[\(\[]|[\)\]]$/g, '');
      // Better split that respects quotes (basic version)
      return inner.split(',').map(p => {
        let clean = p.trim().replace(/^['"]|['"]$/g, '');
        if (clean.includes('datetime.datetime')) {
          const m = clean.match(/\d+,\s*\d+,\s*\d+/);
          return m ? m[0].split(',').map(x => x.trim().padStart(2, '0')).join('-') : clean;
        }
        return clean;
      });
    }
  }

  return val;
}

// ... rest of imports
// explicitly specify the path to handle potential CWD issues
dotenv.config({ 
  path: path.join(process.cwd(), '.env'),
  override: true 
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchWithRetry(url: string, options: any, retries = 2, delay = 1500): Promise<any> {
  try {
    return await axios.get(url, options);
  } catch (error: any) {
    const isTimeout = error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'));
    const isStatus5xx = error.response && error.response.status >= 500;
    const isNetworkError = !error.response; // No response from server at all (network error / socket closed etc)
    
    if (retries > 0 && (isTimeout || isNetworkError || isStatus5xx)) {
      console.warn(`[RETRY] Request to ${url} timed out or encountered a server/network error. Reason: ${error.message || error.code}. Retries left: ${retries}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

function getUgelApiUrl(): string {
  let apiUrl = (process.env.VITE_UGEL_API_URL || "https://backcall.jamuywasi.com").trim();
  if (!apiUrl.startsWith('http')) {
    apiUrl = "https://backcall.jamuywasi.com";
  }
  return apiUrl;
}

function getCreditApiUrl(): string {
  let apiUrl = (process.env.VITE_CREDIT_API_URL || "https://gnsis-api.jamuywasi.com").trim();
  if (!apiUrl.startsWith('http')) {
    apiUrl = "https://gnsis-api.jamuywasi.com";
  }
  return apiUrl;
}

// Memory cache for mapped UGEL leads to optimize search, pagination and prevent timeouts
let cachedLeads: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache duration
let isFetchingCache = false;
let cacheFetchPromise: Promise<any[]> | null = null;

async function getOrUpdateUgelLeadsCache(): Promise<any[]> {
  const now = Date.now();
  // Return cached copy if still valid and not empty
  if (cachedLeads.length > 0 && (now - cacheTimestamp < CACHE_DURATION)) {
    return cachedLeads;
  }

  // Deduplicate concurrent refreshing requests
  if (isFetchingCache && cacheFetchPromise) {
    return cacheFetchPromise;
  }

  isFetchingCache = true;
  cacheFetchPromise = (async () => {
    try {
      const apiUrl = getUgelApiUrl();
      const fullUrl = `${apiUrl}/data_ugel_ata`;
      console.log(`[CACHE] Refreshing UGEL cache from external API: ${fullUrl}`);
      
      // Fetch up to 5000 items in a single rapid request
      const response = await axios.get(fullUrl, {
        params: { limit: 5000, offset: 0 },
        timeout: 30000 
      });

      const parsed = smartParse(response.data);
      const rawData = Array.isArray(parsed) ? parsed : [parsed];
      
      const seenDnis = new Set<string>();
      const mapped: any[] = [];

      for (const item of rawData) {
        if (!item) continue;
        
        let clientItem: any;
        if (Array.isArray(item)) {
          const dni = (item[15]?.toString() || "0").trim();
          clientItem = {
            dni,
            firstName: item[10]?.toString() || "",
            lastName: `${item[8] || ""} ${item[9] || ""}`.trim(),
            sex: item[12] === 1 ? 'F' : 'M',
            laborData: {
              company: item[4]?.toString() || "UGEL",
              laborStatus: item[5] === 1 ? 'nombrado' : 'contratado',
              modularCode: item[4]?.toString() || "",
              positionCode: item[3]?.toString() || "",
              startDate: item[18],
              endDate: item[19] && !item[19].toString().includes('1900') ? item[19] : undefined
            },
            status: 'available',
            phones: item[16] ? [{ number: item[16].toString(), hasWhatsapp: false }] : []
          };
        } else {
          const dni = (item.dni || item[15] || "").toString().trim();
          clientItem = {
            dni,
            firstName: item.nombres || item[10] || "",
            lastName: item.apellido_paterno ? `${item.apellido_paterno} ${item.apellido_materno}`.trim() : `${item[8] || ""} ${item[9] || ""}`.trim(),
            sex: item.sexo === 1 ? 'F' : 'M',
            laborData: {
              company: item.iiee || item[4] || "UGEL",
              laborStatus: item.tipo_servidor === 1 ? 'nombrado' : 'contratado',
              modularCode: item.cod_modu?.toString() || item[4]?.toString() || "",
              positionCode: item.cargo?.toString() || item[3]?.toString() || "",
              startDate: item.fecha_inicio || item[18],
              endDate: item.fecha_cese && !item.fecha_cese.toString().includes('1900') ? item.fecha_cese : (item[19] && !item[19].toString().includes('1900') ? item[19] : undefined)
            },
            status: 'available',
            phones: []
          };
        }

        const isValidDni = clientItem.dni && clientItem.dni !== "0" && clientItem.dni.length >= 7;
        if (isValidDni && !seenDnis.has(clientItem.dni)) {
          seenDnis.add(clientItem.dni);
          mapped.push(clientItem);
        }
      }

      cachedLeads = mapped;
      cacheTimestamp = Date.now();
      console.log(`[CACHE] UGEL cache successfully updated. Loaded ${cachedLeads.length} valid leads.`);
      return cachedLeads;
    } catch (err: any) {
      console.error(`[CACHE] Error fetching external UGEL database to populate cache:`, err.message);
      if (cachedLeads.length > 0) {
        console.warn(`[CACHE] Serving stale cache data due to update failure.`);
        return cachedLeads;
      }
      throw err;
    } finally {
      isFetchingCache = false;
      cacheFetchPromise = null;
    }
  })();

  return cacheFetchPromise;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Proxy search by DNI
  app.get("/api/ugel/data/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      const apiUrl = getUgelApiUrl();
      const fullUrl = `${apiUrl}/data_ugel_ata_dni/${dni}`;
      console.log(`Searching DNI in UGEL API: ${fullUrl}`);

      const response = await axios.get(fullUrl, {
        timeout: 5000 
      });

      console.log(`[DEBUG] Raw response from DNI API for ${dni}:`, typeof response.data === 'string' ? `"${response.data}"` : response.data);

      // Normalize data using smartParse to handle tuple strings or JSON objects
      const data = smartParse(response.data);
      console.log(`[DEBUG] Parsed data for ${dni}:`, JSON.stringify(data).substring(0, 500));
      
      // Determine if 'data' is a list of leads or a single lead tuple
      // If it's an array where the first element is NOT an array/object but a primitive (like the ID 4),
      // it's likely a single tuple result that needs wrapping.
      let rawData: any[];
      if (Array.isArray(data)) {
        if (data.length > 0 && !Array.isArray(data[0]) && typeof data[0] !== 'object') {
          // It's a single tuple like [4, 'EN', ...]
          rawData = [data];
        } else {
          // It's already a list of tuples or objects
          rawData = data;
        }
      } else {
        rawData = [data];
      }

      const mappedData = rawData.map((item: any) => {
        // Robust check: if it's an array (from tuple)
        if (Array.isArray(item)) {
          // Inner parse for dates that might still be strings
          const parseDateString = (d: any) => {
            if (typeof d === 'string' && d.includes('-')) return d; // Already ISO
            return d;
          };

          return {
            dni: item[15]?.toString() || dni,
            firstName: item[10]?.toString() || "",
            lastName: `${item[8] || ""} ${item[9] || ""}`.trim(),
            sex: item[12] === 1 ? 'F' : 'M',
            laborData: {
              company: item[4]?.toString() || "UGEL",
              laborStatus: item[5] === 1 ? 'nombrado' : 'contratado',
              modularCode: item[4]?.toString() || "",
              positionCode: item[3]?.toString() || "",
              startDate: parseDateString(item[18]),
              endDate: item[19] && !item[19].toString().includes('1900') ? parseDateString(item[19]) : undefined
            },
            status: 'available',
            phones: item[16] ? [{ number: item[16].toString(), hasWhatsapp: false }] : []
          };
        }

        // Handle Standard Object format (as confirmed by user JSON sample)
        return {
          dni: (item.dni || item[15] || dni).toString().trim(),
          firstName: item.nombres || item[10] || "",
          lastName: item.apellido_paterno ? `${item.apellido_paterno} ${item.apellido_materno}`.trim() : `${item[8] || ""} ${item[9] || ""}`.trim(),
          sex: item.sexo === 1 ? 'F' : 'M',
          laborData: {
            company: item.iiee || item[4] || "UGEL",
            laborStatus: item.tipo_servidor === 1 ? 'nombrado' : 'contratado',
            modularCode: item.cod_modu?.toString() || item[4]?.toString() || "",
            positionCode: item.cargo?.toString() || item[3]?.toString() || "",
            startDate: item.fecha_inicio || item[18],
            endDate: item.fecha_cese && !item.fecha_cese.toString().includes('1900') ? item.fecha_cese : (item[19] && !item[19].toString().includes('1900') ? item[19] : undefined)
          },
          status: 'available',
          phones: []
        };
      }).filter((item: any) => item && item.dni);

      res.json(mappedData);
    } catch (error: any) {
      console.error(`Error searching DNI ${req.params.dni}:`, error.message);
      res.status(500).json({ error: "Error en la búsqueda por DNI" });
    }
  });

  app.get("/api/ugel/credits/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      const apiUrl = getCreditApiUrl();
      const fullUrl = `${apiUrl}/api/credito/${dni}`;
      console.log(`[DEBUG] Fetching credits for ${dni} from new API: ${fullUrl}`);

      const response = await fetchWithRetry(fullUrl, {
        timeout: 50000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      console.log(`[DEBUG] Status: ${response.status}`);
      console.log(`[DEBUG] Response Data Head: ${JSON.stringify(response.data).substring(0, 500)}`);

      const apiData = response.data;

      if (!apiData) {
        console.log(`[DEBUG] apiData is null or undefined`);
        return res.json({
          warning: "La respuesta del servidor de créditos está vacía."
        });
      }

      if (apiData.success === false) {
        console.log(`[DEBUG] apiData.success is false: ${apiData.error}`);
        const errMsg = apiData.error || "";
        if (
          !errMsg || 
          errMsg.toLowerCase().includes("no se encontraron") || 
          errMsg.toLowerCase().includes("no se encontró")
        ) {
          return res.json({
            warning: "NO SE ENCONTRO CREDITO"
          });
        }
        return res.json({
          warning: errMsg
        });
      }

      // Sometimes success might be a string "true" or "1" or there might be no success key but data exists
      const isSuccess = apiData.success === true || apiData.success === "true" || apiData.success === 1;

      // Normalize data to an array since API can return a single object or an array of objects
      let dataArray: any[] = [];
      if (Array.isArray(apiData.data)) {
        dataArray = apiData.data;
      } else if (apiData.data && typeof apiData.data === 'object') {
        dataArray = [apiData.data];
      }

      if (isSuccess && dataArray.length > 0) {
        const mappedCreditos = dataArray.map((item: any) => {
          const creditId = item.credito?.id || 0;
          
          // Build historical items and statuses
          const items: Record<string, number> = {};
          const statuses: Record<string, string> = {};

          if (Array.isArray(item.historial_cuotas)) {
            item.historial_cuotas.forEach((cuota: any) => {
              const monthStr = `${cuota.anio}-${String(cuota.mes).padStart(2, '0')}`;
              items[monthStr] = cuota.monto || 0;
              
              let statusChar = '⚪';
              if (cuota.color === 'AZUL' || cuota.estado === 'COBRADA') {
                statusChar = '🔵';
              } else if (cuota.color === 'VERDE' || cuota.estado === 'FALTANTE' || cuota.deuda > 0) {
                statusChar = '🟢';
              } else if (cuota.color === 'NEGRO' || cuota.estado === 'NO_COBRADA') {
                statusChar = '⚪';
              }
              statuses[monthStr] = statusChar;
            });
          }

          return {
            credit_num: creditId,
            detalle: {
              credit_num: creditId,
              total_credits: item.consulta?.total_creditos_encontrados || dataArray.length,
              dni: item.credito?.dni || dni,
              nombre: item.credito?.cliente || "",
              fecha_credito: item.credito?.fecha_emision || "",
              monto_credito: item.credito?.monto_total || 0,
              deuda: item.credito?.deuda_total || 0,
              monto_descontado: item.credito?.monto_descontado || 0,
              pagos_reg: item.resumen_cuotas?.cuotas_pagadas_azul || 0,
              cuotas_pendientes: item.resumen_cuotas?.cuotas_faltantes_verde || 0,
              cuotas_atrasadas: item.resumen_cuotas?.cuotas_no_cobradas_negro || 0,
              cuota_mensual_estimada: item.credito?.cuota_mensual || 0,
              mes_actual: item.consulta?.fecha || "",
              estado_mes_actual: item.credito?.estado || ""
            },
            historial: {
              items,
              statuses
            }
          };
        });

        console.log(`[DEBUG] Mapped ${mappedCreditos.length} credits successfully.`);
        return res.json({
          creditos: mappedCreditos
        });
      }

      console.log(`[DEBUG] Conditions not met. success: ${apiData.success}, isArray(data): ${Array.isArray(apiData.data)}, dataArray_len: ${dataArray.length}`);
      return res.json({
        warning: `No se encontraron registros de crédito activos para este DNI. (success=${apiData.success}, data_type=${typeof apiData.data})`
      });
    } catch (error: any) {
      const errorData = error.response?.data;
      const is404 = error.response && (
        error.response.status === 404 || 
        (errorData && (
          errorData.success === false || 
          (errorData.error && errorData.error.toLowerCase().includes("no se encontraron")) ||
          (errorData.error && errorData.error.toLowerCase().includes("no se encontró"))
        ))
      );

      if (is404) {
        console.log(`[INFO] No credits found for DNI ${req.params.dni} (Standard business result)`);
        return res.json({
          warning: "NO SE ENCONTRO CREDITO"
        });
      }

      console.error(`Error fetching credits for DNI ${req.params.dni}:`, error.message);
      if (error.response) {
        console.error(`[DEBUG] Upstream status code: ${error.response.status}`);
        console.error(`[DEBUG] Upstream body snippet: ${JSON.stringify(error.response.data).substring(0, 500)}`);
        return res.json({
          warning: `Error del servidor externo (Status ${error.response.status}): ${JSON.stringify(error.response.data).substring(0, 100)}`
        });
      }
      res.status(500).json({ error: `Error al consultar créditos en el sistema: ${error.message}` });
    }
  });

  app.get("/api/verificar/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      const apiUrl = getUgelApiUrl();

      const fullUrl = `${apiUrl}/verificar/${dni}`;
      console.log(`[DEBUG] Fetching contacts for ${dni}: ${fullUrl}`);

      const response = await axios.get(fullUrl, {
        timeout: 300000 
      });

      res.json(response.data);
    } catch (error: any) {
      console.error(`Error fetching contacts for DNI ${req.params.dni}:`, error.message);
      res.status(500).json({ error: "Error al consultar números de contacto" });
    }
  });

  // Proxy for WhatsApp API auth/qr
  app.get("/api/whatsapp/auth/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      const apiUrl = (process.env.VITE_WHATSAPP_API_URL || "https://verifywsp.jamuywasi.com").trim();
      const fullUrl = `${apiUrl}/auth?dni=${dni}`;
      
      console.log(`[WhatsApp Proxy] Auth: ${fullUrl}`);
      const response = await axios.get(fullUrl, { timeout: 10000 });
      res.json(response.data);
    } catch (error: any) {
      console.error(`WhatsApp Auth Proxy Error: ${error.message}`);
      res.status(500).json({ error: "Error de comunicación con el servicio de WhatsApp" });
    }
  });

  // Proxy for WhatsApp API verify
  app.get("/api/whatsapp/verify", async (req, res) => {
    try {
      const { dni_verify, dni } = req.query;
      const apiUrl = (process.env.VITE_WHATSAPP_API_URL || "https://verifywsp.jamuywasi.com").trim();
      const fullUrl = `${apiUrl}/verificar-dni?dni_verify=${dni_verify}&dni=${dni}`;
      
      console.log(`[WhatsApp Proxy] Verify: ${fullUrl}`);
      const response = await axios.get(fullUrl, { timeout: 30000 });
      res.json(response.data);
    } catch (error: any) {
      console.error(`WhatsApp Verify Proxy Error: ${error.message}`);
      res.status(500).json({ error: "Error al verificar números de WhatsApp" });
    }
  });

  // Proxy endpoint for UGEL data (general list supporting DNI and name search)
  app.get("/api/ugel/data", async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit) || 50;
      const startOffset = Number(req.query.offset) || 0;
      const rawSearch = req.query.search ? String(req.query.search).trim() : "";
      
      const allLeads = await getOrUpdateUgelLeadsCache();
      
      let filteredLeads = allLeads;
      if (rawSearch) {
        const queryTerm = rawSearch.toLowerCase();
        filteredLeads = allLeads.filter(lead => {
          const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.toLowerCase();
          const reverseName = `${lead.lastName || ''} ${lead.firstName || ''}`.toLowerCase();
          const dni = (lead.dni || '').toString().toLowerCase();
          return fullName.includes(queryTerm) || reverseName.includes(queryTerm) || dni.includes(queryTerm);
        });
      }

      const paginatedLeads = filteredLeads.slice(startOffset, startOffset + requestedLimit);
      
      res.json({
        leads: paginatedLeads,
        nextOffset: startOffset + paginatedLeads.length,
        hasMore: (startOffset + paginatedLeads.length) < filteredLeads.length,
        totalLeads: filteredLeads.length
      });
    } catch (error: any) {
      const validatedUrl = getUgelApiUrl();
      
      console.error(`Error filtering UGEL data. Target URL: ${validatedUrl}. Error:`, error.message);
      
      res.status(500).json({ 
        error: "Error de conexión con la API o de búsqueda",
        details: `Intentado: ${validatedUrl}/data_ugel_ata. Error original: ${error.message}`
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
