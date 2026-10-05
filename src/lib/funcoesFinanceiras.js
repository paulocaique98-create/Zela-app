import { supabase } from './supabase';
import { chamarFuncaoComSessao } from './sessao';

// Chama uma Edge Function financeira (renova a sessão se preciso) e devolve
// os dados, ou lança um Error com a mensagem em português que o servidor
// mandou (nunca "Edge Function returned a non-2xx status code").
export async function chamarFuncaoFinanceira(nome, body) {
  const { data, error, mensagem } = await chamarFuncaoComSessao(supabase, nome, { body });
  if (error) throw new Error(mensagem || error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
