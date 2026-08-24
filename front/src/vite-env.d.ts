/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_LEADS_API_URL?: string;
  readonly VITE_ENVIO_MASIVO_URL?: string;
  readonly VITE_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
