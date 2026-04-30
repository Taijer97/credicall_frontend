import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

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
  override: false 
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Proxy search by DNI
  app.get("/api/ugel/data/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      let apiUrl = (process.env.VITE_UGEL_API_URL || "http://127.0.0.1:8090").trim();
      
      if (!apiUrl.startsWith('http')) {
        apiUrl = "http://127.0.0.1:8090";
      }

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
      let apiUrl = (process.env.VITE_UGEL_API_URL || "http://127.0.0.1:8090").trim();
      if (!apiUrl.startsWith('http')) apiUrl = "http://127.0.0.1:8090";

      const fullUrl = `${apiUrl}/historia_credit/${dni}`;
      console.log(`[DEBUG] Fetching credits for ${dni}: ${fullUrl}`);

      const response = await axios.get(fullUrl, {
        timeout: 25000 
      });

      res.json(response.data);
    } catch (error: any) {
      console.error(`Error fetching credits for DNI ${req.params.dni}:`, error.message);
      res.status(500).json({ error: "Error al consultar créditos en el sistema" });
    }
  });

  app.get("/api/verificar/:dni", async (req, res) => {
    try {
      const { dni } = req.params;
      let apiUrl = (process.env.VITE_UGEL_API_URL || "http://127.0.0.1:8090").trim();
      if (!apiUrl.startsWith('http')) apiUrl = "http://127.0.0.1:8090";

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

  // Proxy endpoint for UGEL data (general list)
  app.get("/api/ugel/data", async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit) || 50;
      const startOffset = Number(req.query.offset) || 0;
      
      let apiUrl = (process.env.VITE_UGEL_API_URL || "http://127.0.0.1:8090").trim();
      if (!apiUrl.startsWith('http')) apiUrl = "http://127.0.0.1:8090";

      const fullUrl = `${apiUrl}/data_ugel_ata`;
      
      let allValidLeads: any[] = [];
      let currentApiOffset = startOffset;
      let hasMore = true;
      const seenDnis = new Set();
      let fetchCount = 0;
      const MAX_FETCHES = 5; // Safety to avoid infinite loops

      while (allValidLeads.length < requestedLimit && hasMore && fetchCount < MAX_FETCHES) {
        fetchCount++;
        // Fetch slightly more than needed to fill gaps
        const batchLimit = Math.max(requestedLimit * 2, 100);
        
        const response = await axios.get(fullUrl, {
          params: { limit: batchLimit, offset: currentApiOffset },
          timeout: 15000 
        });

        const data = smartParse(response.data);
        const rawData = Array.isArray(data) ? data : [data];
        
        if (rawData.length === 0) {
          hasMore = false;
          break;
        }

        const mappedBatch = rawData.map((item: any) => {
          if (Array.isArray(item)) {
            return {
              dni: (item[15]?.toString() || "0").trim(),
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
          }
          const dniObj = (item.dni || item[15] || "0").toString().trim();
          return {
            dni: dniObj,
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
        });

        for (const item of mappedBatch) {
          const isValidDni = item && item.dni && item.dni !== "0" && item.dni !== "" && item.dni.length >= 7;
          if (isValidDni && !seenDnis.has(item.dni)) {
            seenDnis.add(item.dni);
            allValidLeads.push(item);
            if (allValidLeads.length >= requestedLimit) break;
          }
        }

        // Move the pointer for the next fetch
        currentApiOffset += rawData.length;
        if (rawData.length < batchLimit) hasMore = false;
      }

      res.json({
        leads: allValidLeads,
        nextOffset: currentApiOffset,
        hasMore: hasMore
      });
    } catch (error: any) {
      let rawApiUrl = (process.env.VITE_UGEL_API_URL || "http://127.0.0.1:8090").trim();
      let validatedUrl = rawApiUrl.startsWith('http') ? rawApiUrl : "http://127.0.0.1:8090";
      
      console.error(`Error fetching UGEL data. Raw URL: ${rawApiUrl}, Target URL: ${validatedUrl}. Error:`, error.message);
      
      res.status(500).json({ 
        error: "Error de conexión con la API",
        details: `Intentado: ${validatedUrl}/data_ugel_ata. Error original: ${error.message}`,
        diagnostics: {
          rawEnvValue: rawApiUrl,
          isUsingFallback: !rawApiUrl.startsWith('http'),
          advice: rawApiUrl === "KEVIN2026" 
            ? "El valor 'KEVIN2026' está sobrescribiendo tu configuración. He intentado usar localhost como respaldo, pero no hay respuesta."
            : "Asegúrate de que tu servidor local o ngrok esté activo y sea accesible."
        }
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
