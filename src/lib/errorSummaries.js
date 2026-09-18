// Traduz mensagens de erro técnicas (em inglês, do navegador/JS) e as
// categorias estruturadas de error_logs para uma frase curta em português,
// pra quem olha o Portal do Dev não precisar decifrar "'text/html' is not a
// valid JavaScript MIME type." sozinho. Sempre best-effort: quando não
// reconhece o padrão, retorna null e a tela mostra só a mensagem original.

// Categorias de source='face_recognition' (ver AdminFaceScanner.jsx / Fase
// B1 do PLANO_LOGGING_ERROS_PORTAL_DEV.md).
const FACE_RECOGNITION_SUMMARIES = {
  no_face_detected: 'Ninguém identificado no quadro na hora da captura -- pode ser rosto fora do ângulo da câmera, ou a pessoa desistiu antes de posicionar.',
  frame_position_rejected: 'Rosto detectado, mas longe, perto ou descentralizado demais do molde -- não chegou a comparar com ninguém cadastrado.',
  below_threshold: 'Rosto comparado, mas a distância pro cadastro mais próximo ficou acima do limite de segurança -- pode ser a pessoa certa em condição ruim (luz, ângulo) ou realmente ninguém cadastrado.',
  ambiguous_match: 'Dois cadastros ficaram parecidos demais entre si -- o sistema preferiu não arriscar confirmar a pessoa errada.',
  stuck_timeout: '20 segundos sem reconhecer ninguém -- o totem ofereceu a alternativa de Senha/QR Code.',
  camera_watchdog_recovery: 'A câmera travou ou parou de responder e o sistema recuperou sozinho, sem intervenção manual.',
  rate_limited: 'Bloqueado por excesso de tentativas de reconhecimento em pouco tempo (proteção contra abuso).',
  matched_person_not_found: 'Inconsistência interna: o sistema achou uma correspondência, mas não conseguiu localizar os dados dessa pessoa.',
};

// Categorias de source='business' já usadas hoje (ver logAppError em
// errorLogger.js).
const BUSINESS_SUMMARIES = {
  attendance_log_insert_failed: 'O status do aluno foi atualizado, mas o registro histórico de entrada/saída NÃO foi salvo -- esse check-in pode não aparecer no Histórico nem em Horas Extras.',
  update_student_status_failed: 'Falha ao atualizar o status de presença de um aluno (entrada/saída/solicitação).',
};

function summarizeByCategory(source, category) {
  if (source === 'face_recognition') return FACE_RECOGNITION_SUMMARIES[category] || null;
  if (source === 'business') return BUSINESS_SUMMARIES[category] || null;
  if (source === 'cron') return `Falha na rotina automática "${category}" -- verifique se ela rodou corretamente.`;
  if (source === 'edge_function') return `Falha no servidor ao processar "${category}" -- a ação que o usuário tentou fazer provavelmente não foi concluída.`;
  return null;
}

// Padrões de mensagens técnicas de erro JS/navegador (source='client',
// tanto client_error_logs quanto error_logs). Cada entrada é
// [regex, frase em português]. Ordem importa -- o primeiro que bater vence.
const CLIENT_MESSAGE_PATTERNS = [
  [/not a valid javascript mime type|failed to fetch dynamically imported module|chunkloaderror|unable to preload css|importing a module script failed/i,
    'Provavelmente uma versão antiga do site tentando carregar um arquivo que não existe mais depois de um novo deploy. Costuma resolver sozinho ao atualizar a página (ou fechar e abrir de novo).'],
  [/unexpected token '<'|unexpected token <|is not valid json/i,
    'O app esperava uma resposta de dados e recebeu uma página HTML no lugar -- geralmente o mesmo caso de versão antiga após um deploy, ou uma falha de rede no meio do carregamento.'],
  [/failed to fetch|networkerror when attempting to fetch|load failed|the network connection was lost/i,
    'Falha de conexão com a internet ou com o servidor no momento em que a ação foi feita -- provavelmente o usuário estava com conexão instável.'],
  [/resizeobserver loop/i,
    'Aviso inofensivo do navegador sobre redimensionamento de elementos na tela -- não afeta o funcionamento do app, pode ignorar.'],
  [/notallowederror|permission denied.*camera|permission denied.*microphone/i,
    'O usuário negou (ou o navegador bloqueou) o acesso à câmera ou microfone.'],
  [/notfounderror.*camera|no camera found|requested device not found/i,
    'Nenhuma câmera foi encontrada no dispositivo usado.'],
  [/notreadableerror|device in use/i,
    'A câmera estava sendo usada por outro aplicativo ou aba no momento.'],
  [/quotaexceedederror|storage quota/i,
    'O navegador recusou salvar dados localmente por falta de espaço (quota de armazenamento excedida).'],
  [/script error\.?$/i,
    'Erro de um script de origem externa (ex: extensão do navegador) -- o navegador não revela detalhes por segurança, geralmente não é um bug do próprio app.'],
  [/loading chunk \d+ failed/i,
    'Falha ao carregar uma parte do site após um novo deploy -- geralmente resolve atualizando a página.'],
];

function summarizeClientMessage(message) {
  if (!message) return null;
  for (const [pattern, summary] of CLIENT_MESSAGE_PATTERNS) {
    if (pattern.test(message)) return summary;
  }
  return null;
}

// Função única usada pelas telas: tenta primeiro pela categoria estruturada
// (mais confiável, quando existe), senão tenta reconhecer a mensagem crua.
export function summarizeErrorLog({ source, category, message }) {
  return summarizeByCategory(source, category) || summarizeClientMessage(message);
}
