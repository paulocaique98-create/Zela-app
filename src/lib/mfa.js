import { supabase } from './supabase';

// 2FA (TOTP / Google Authenticator) só no LOGIN do app -- nunca no check-in/out.
// Roles OBRIGADOS a ter o Authenticator: só as contas primárias (developer e
// gestao); as demais contas da escola são criadas a partir delas. Todos os outros
// perfis (recepcao, coordenação/direção, professor, responsável, marketing...)
// ativam ou desativam por conta própria em Configurações. 'recepcao' nunca deve
// ser obrigatório: a mesma conta roda o totem/tablet (aba kiosk).
export const MFA_ROLES_OBRIGATORIOS = ['developer', 'gestao'];

export const mfaObrigatorio = (role) => MFA_ROLES_OBRIGATORIOS.includes(role);

// Depois de validar o código, o aparelho fica "confiável" por 24h: sair e entrar de
// novo nesse período não pede o código outra vez. Guardado por usuário no navegador.
export const MFA_CONFIANCA_MS = 24 * 60 * 60 * 1000;
const CHAVE_CONFIANCA = 'zela_mfa_ok';

const lerConfianca = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE_CONFIANCA) || '{}') || {}; } catch { return {}; }
};

export function marcarMfaConfiavel(userId) {
  if (!userId) return;
  try { localStorage.setItem(CHAVE_CONFIANCA, JSON.stringify({ ...lerConfianca(), [userId]: Date.now() })); } catch { /* storage indisponível */ }
}

export function limparMfaConfiavel(userId) {
  try {
    const atual = lerConfianca();
    delete atual[userId];
    localStorage.setItem(CHAVE_CONFIANCA, JSON.stringify(atual));
  } catch { /* noop */ }
}

export function mfaConfiavel(userId) {
  const quando = userId ? lerConfianca()[userId] : null;
  return typeof quando === 'number' && Date.now() - quando < MFA_CONFIANCA_MS && Date.now() >= quando;
}

// Após a senha: a sessão precisa de um 2º fator? (tem fator verificado e ainda está em aal1)
export async function exigeSegundoFator() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return { exige: false };
  const { data: sess } = (await supabase.auth.getSession?.()) || {};
  if (mfaConfiavel(sess?.session?.user?.id)) return { exige: false };
  const { data: fatores, error: errF } = await supabase.auth.mfa.listFactors();
  if (errF) throw errF;
  const fator = fatores?.totp?.[0]; // listFactors().totp só traz fatores verificados
  return fator ? { exige: true, factorId: fator.id } : { exige: false };
}

export async function listarFatoresVerificados() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data?.totp || [];
}

// Inicia o cadastro: devolve QR (data URI SVG), segredo manual e o id do fator.
// Fatores antigos não confirmados são descartados para não acumular lixo.
export async function iniciarCadastroTotp() {
  const { data: todos } = await supabase.auth.mfa.listFactors();
  const pendentes = (todos?.all || []).filter(f => f.factor_type === 'totp' && f.status === 'unverified');
  for (const f of pendentes) await supabase.auth.mfa.unenroll({ factorId: f.id });
  // Nome único: o Supabase recusa dois fatores com o mesmo nome (o modo dev do React
  // roda o efeito duas vezes e chamava enroll em duplicidade).
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Zela ${Date.now()}` });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

// Valida o código de 6 dígitos (serve tanto para confirmar o cadastro quanto para o login).
export async function verificarCodigo(factorId, code) {
  const limpo = String(code || '').replace(/\D/g, '');
  if (limpo.length !== 6) throw new Error('Digite os 6 números do aplicativo.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: limpo });
  if (error) throw new Error('Código inválido ou expirado. Confira o relógio do celular e tente de novo.');
  try {
    const { data: sess } = (await supabase.auth.getSession?.()) || {};
    marcarMfaConfiavel(sess?.session?.user?.id);
  } catch { /* confiança é só conveniência */ }
}

export async function removerFator(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  try {
    const { data: sess } = (await supabase.auth.getSession?.()) || {};
    limparMfaConfiavel(sess?.session?.user?.id);
  } catch { /* noop */ }
}
