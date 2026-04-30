/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UGEL_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
