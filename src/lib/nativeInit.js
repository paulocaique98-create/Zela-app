import { Capacitor } from '@capacitor/core';

// Ajustes só do app nativo (Capacitor). Na web não faz nada e os plugins
// nem são baixados (import dinâmico). Falha aqui nunca pode travar o app.
export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // ícones claros sobre fundo escuro
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1e5563' });
    }
  } catch (e) {
    console.warn('[nativeInit] StatusBar indisponível', e);
  }
}
