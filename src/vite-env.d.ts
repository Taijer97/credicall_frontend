/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UGEL_API_URL: string;
  readonly VITE_WHATSAPP_API_URL: string;
  readonly VITE_CREDIT_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
