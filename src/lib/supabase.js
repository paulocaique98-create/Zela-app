import { createClient } from '@supabase/supabase-js';

// Fallback só existe pra não quebrar createClient() em CI/testes unitários
// que importam este módulo sem precisar de credenciais reais (ex: teste
// puro de um parser que só por acaso importa um componente que importa
// supabase.js). Em produção (Vercel) as env vars reais sempre existem —
// isso nunca mascara uma configuração de produção faltando.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Secondary client for registering users without affecting the logged-in session
export const supabaseAuthHelper = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'zela_kiosk_auth_helper', // Chave separada — não interfere na sessão principal
  }
});

