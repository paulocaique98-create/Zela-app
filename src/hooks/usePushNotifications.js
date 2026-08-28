import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { isIOS, isStandalone } from '../lib/platformDetection';

// Fonte central da lógica de Notificações Push — usada tanto pelo Portal da
// Família quanto pelo Painel Admin (via <PushNotificationsCard>, em
// src/components/PushNotificationsCard.jsx). Mantém os campos originais
// (permission, isSubscribed, isLoading, subscribe, unsubscribe) intactos
// pra não quebrar quem já consome o hook, e adiciona: isSupported, isIOS,
// isStandaloneMode, error e status (um resumo derivado, pronto pra UI).
export function usePushNotifications(currentUser, currentSchool) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  // Calculados uma vez (não mudam durante a sessão) — plataforma/capacidade
  // do navegador atual, não dependem de currentUser/currentSchool.
  const iosDevice = useMemo(() => isIOS(), []);
  const standaloneMode = useMemo(() => isStandalone(), []);
  const isSupported = useMemo(() => (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined' &&
    !!VAPID_PUBLIC_KEY
  ), [VAPID_PUBLIC_KEY]);
  // iOS só permite Web Push a partir do app instalado na Tela de Início
  // (Safari, iOS 16.4+) — fora disso, nem vale tentar pedir permissão.
  const iosInstallRequired = iosDevice && !standaloneMode;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  // Verificar se já está subscrito ao montar
  useEffect(() => {
    async function checkSubscription() {
      if (!('serviceWorker' in navigator) || !currentUser) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!registration) return;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (err) {
        console.warn('[Push] Erro ao verificar subscription:', err);
      }
    }
    checkSubscription();
  }, [currentUser]);

  const subscribe = useCallback(async () => {
    setError(null);

    if (iosInstallRequired) {
      // Não chama requestPermission()/subscribe() nesse cenário — no Safari
      // fora do modo standalone isso nunca funciona, só confunde o usuário
      // com um prompt (ou erro) sem efeito real.
      setError('No iPhone/iPad, adicione o Zela à Tela de Início pelo Safari antes de ativar as notificações.');
      return false;
    }

    if (!isSupported) {
      setError(
        !('serviceWorker' in navigator) || !('PushManager' in window)
          ? 'Seu navegador não suporta notificações push.'
          : 'Notificações push não estão configuradas neste ambiente.'
      );
      return false;
    }

    setIsLoading(true);
    try {
      // Registrar service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Reaproveita uma subscription já existente nesse dispositivo/navegador
      // em vez de sempre criar uma nova — evita o prompt de permissão de novo
      // quando já está tudo certo, e evita duplicar linha em push_subscriptions
      // (a unique key é user_id+endpoint, então tecnicamente não duplicaria,
      // mas também não há motivo pra recriar o endpoint à toa).
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Pedir permissão
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== 'granted') {
          setIsLoading(false);
          if (perm === 'denied') setError('O navegador bloqueou as notificações.');
          return false;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      const sub = subscription.toJSON();

      // Salvar no Supabase
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: currentUser.id,
          school_id: currentSchool.id,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          device_info: navigator.userAgent,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,endpoint' });

      if (dbError) throw dbError;
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[Push] Erro ao ativar notificações:', err);
      setError('Não foi possível ativar as notificações neste dispositivo. Tente novamente.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, currentSchool, VAPID_PUBLIC_KEY, isSupported, iosInstallRequired]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Só o endpoint DESTE dispositivo/navegador é removido — outras
        // subscriptions do mesmo usuário (outro celular, outro navegador)
        // continuam intactas, cada uma é uma linha independente na tabela.
        await subscription.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('endpoint', subscription.endpoint);
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[Push] Erro ao desativar notificações:', err);
      setError('Não foi possível desativar as notificações neste dispositivo.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // Resumo derivado pra UI decidir o que mostrar sem repetir essa cascata de
  // ifs em cada tela que consome o hook (FamilySettings, AdminSettings...).
  const status = useMemo(() => {
    if (isLoading) return 'subscribing';
    if (!isSupported) return 'unsupported';
    if (iosInstallRequired) return 'ios-install-required';
    if (permission === 'denied') return 'permission-denied';
    if (isSubscribed) return 'subscribed';
    if (error) return 'error';
    if (permission === 'default') return 'permission-default';
    return 'available';
  }, [isLoading, isSupported, iosInstallRequired, permission, isSubscribed, error]);

  return {
    permission, isSubscribed, isLoading, subscribe, unsubscribe,
    isSupported, isIOS: iosDevice, isStandalone: standaloneMode, error, status,
  };
}
