import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function usePushNotifications(currentUser, currentSchool) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Seu navegador não suporta notificações push.');
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.error('[Push] VITE_VAPID_PUBLIC_KEY não configurada.');
      alert('Notificações push não estão configuradas neste ambiente.');
      return false;
    }
    setIsLoading(true);
    try {
      // Registrar service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Pedir permissão
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setIsLoading(false);
        return false;
      }

      // Criar subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      const sub = subscription.toJSON();

      // Salvar no Supabase
      const { error } = await supabase
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

      if (error) throw error;
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[Push] Erro ao ativar notificações:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, currentSchool, VAPID_PUBLIC_KEY]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
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
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
