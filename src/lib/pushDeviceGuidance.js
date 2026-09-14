// A partir do Android 10, o Chrome reduz o user agent (ex: "Android 10; K",
// sem marca/modelo), então não dá pra detectar Samsung/Xiaomi/Motorola de
// forma confiável só pelo user agent — foi exatamente esse caso real (Galaxy
// S23 Ultra aparecendo como "Android 10; K"). Por isso a orientação distingue
// só a plataforma (iOS/Android/computador) e lista os fabricantes Android
// mais comuns como passos que o próprio usuário escolhe qual seguir.
export function getPushPlatform(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function getPushGuidance(userAgent) {
  const platform = getPushPlatform(userAgent);

  if (platform === 'ios') {
    return {
      platform,
      title: 'Para garantir as notificações no iPhone',
      steps: [
        'Adicione o Zela à tela de início: no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". Notificações só funcionam em segundo plano quando o Zela é aberto assim, e não direto pelo Safari.',
        'Em Ajustes do iPhone, procure o Zela na lista de apps e confirme que "Notificações" está permitido.',
      ],
    };
  }

  if (platform === 'android') {
    return {
      platform,
      title: 'Para garantir as notificações no Android',
      steps: [
        'Nos Ajustes do celular, procure o app Chrome e confirme que a permissão de Notificações está ativada.',
        'Se o celular for Samsung: vá em Ajustes > Cuidados com o aparelho e bateria > Bateria > Uso em segundo plano, e retire o Chrome das listas "Apps em hibernação" e "Apps em hibernação profunda".',
        'Se o celular for Xiaomi/Redmi: vá em Ajustes > Apps > Chrome > Economia de bateria, e escolha "Sem restrições". Confirme também que "Início automático" está permitido.',
        'Se o celular for Motorola ou outra marca: procure por "Otimização de bateria" ou "Gerenciador de bateria" nos Ajustes, encontre o Chrome e escolha a opção "Sem restrições" ou "Não otimizar".',
      ],
    };
  }

  return {
    platform,
    title: 'Para garantir as notificações no computador',
    steps: [
      'Mantenha o navegador instalado e permita que ele rode em segundo plano quando fechado (nas configurações do próprio navegador, em Sistema).',
      'Confirme que as notificações do site do Zela não foram bloqueadas nas configurações do navegador.',
    ],
  };
}
