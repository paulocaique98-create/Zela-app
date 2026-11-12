// Economia de energia/calor do totem (celular ou tablet no autoatendimento).
// Funções puras + config local do aparelho (localStorage, sem banco).
//
// Contexto: iPhone da portaria da ZL001 esquentava por rodar a rede neural a
// cada 180 ms 24h por dia, câmera a ~30 fps e tela sempre acesa. Não existe
// API web para ler temperatura no iOS, então a defesa é reduzir a carga:
//  - detecção lenta quando não há ninguém (rápida só com rosto à vista);
//  - repouso (tela preta) depois de alguns minutos sem atividade;
//  - autoproteção: se cada inferência ficar lenta (sinal de throttling
//    térmico do SO), o intervalo aumenta e o repouso entra mais cedo;
//  - horário de funcionamento opcional: fora dele, câmera desligada.

export const INTERVALO_ATIVO_MS = 180;
export const INTERVALO_OCIOSO_MS = 1000;
// Sem rosto por este tempo => passa a detectar devagar.
export const OCIOSO_APOS_MS = 5000;
export const FATOR_SOBRECARGA = 3;

export const REPOUSO_PADRAO_MIN = 3;
export const REPOUSO_SOBRECARGA_MIN = 1;

// Média das últimas inferências acima disso = aparelho sob estresse térmico.
export const LIMIAR_SOBRECARGA_MS = 450;
// Histerese: só volta ao normal abaixo disso (evita oscilar).
export const LIMIAR_RECUPERACAO_MS = 300;
export const JANELA_INFERENCIAS = 8;

export const CHAVE_CONFIG = 'zela_totem_energia';

export const CONFIG_PADRAO = Object.freeze({
  repousoMin: REPOUSO_PADRAO_MIN, // 0 = repouso desativado
  horarioInicio: '', // 'HH:MM' — vazio = sem restrição de horário
  horarioFim: '',
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutosDoDia(hhmm) {
  const m = HHMM.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function normalizarConfig(bruta) {
  const c = { ...CONFIG_PADRAO };
  if (!bruta || typeof bruta !== 'object') return c;
  const rep = Number(bruta.repousoMin);
  if (Number.isFinite(rep) && rep >= 0 && rep <= 120) c.repousoMin = Math.round(rep);
  if (minutosDoDia(bruta.horarioInicio) !== null && minutosDoDia(bruta.horarioFim) !== null) {
    c.horarioInicio = bruta.horarioInicio;
    c.horarioFim = bruta.horarioFim;
  }
  return c;
}

export function lerConfig() {
  try {
    return normalizarConfig(JSON.parse(localStorage.getItem(CHAVE_CONFIG)));
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

export function salvarConfig(config) {
  const c = normalizarConfig(config);
  try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(c)); } catch { /* sem storage: vale só nesta sessão */ }
  return c;
}

// true = fora do horário de atendimento. Aceita janela que cruza a meia-noite
// (ex.: 18:00–06:00 não é usado aqui, mas início > fim significa "vira o dia").
// Início === fim ou horário vazio = sem restrição.
export function foraDoHorario(config, data = new Date()) {
  const ini = minutosDoDia(config?.horarioInicio);
  const fim = minutosDoDia(config?.horarioFim);
  if (ini === null || fim === null || ini === fim) return false;
  const agora = data.getHours() * 60 + data.getMinutes();
  const dentro = ini < fim ? agora >= ini && agora < fim : agora >= ini || agora < fim;
  return !dentro;
}

export function mediaInferencia(duracoes) {
  if (!duracoes || duracoes.length === 0) return 0;
  return duracoes.reduce((a, b) => a + b, 0) / duracoes.length;
}

// Empilha uma duração mantendo só a janela recente.
export function registrarInferencia(duracoes, ms) {
  const prox = [...duracoes, ms];
  return prox.length > JANELA_INFERENCIAS ? prox.slice(prox.length - JANELA_INFERENCIAS) : prox;
}

// Com histerese: `atual` é o estado anterior de sobrecarga.
export function avaliarSobrecarga(duracoes, atual) {
  if (duracoes.length < JANELA_INFERENCIAS) return atual; // amostra insuficiente
  const media = mediaInferencia(duracoes);
  if (atual) return media > LIMIAR_RECUPERACAO_MS;
  return media > LIMIAR_SOBRECARGA_MS;
}

export function calcularIntervalo({ agora, ultimoRostoEm, sobrecarregado = false }) {
  const semRosto = ultimoRostoEm == null || agora - ultimoRostoEm > OCIOSO_APOS_MS;
  const base = semRosto ? INTERVALO_OCIOSO_MS : INTERVALO_ATIVO_MS;
  return sobrecarregado ? base * FATOR_SOBRECARGA : base;
}

export function deveEntrarEmRepouso({ agora, ultimaAtividadeEm, config, sobrecarregado = false, ocupado = false }) {
  if (ocupado) return false;
  const min = sobrecarregado
    ? (config?.repousoMin > 0 ? Math.min(config.repousoMin, REPOUSO_SOBRECARGA_MIN) : REPOUSO_SOBRECARGA_MIN)
    : config?.repousoMin;
  if (!(min > 0)) return false;
  return agora - ultimaAtividadeEm >= min * 60000;
}
