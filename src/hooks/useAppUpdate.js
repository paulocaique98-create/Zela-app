import { useEffect, useState } from 'react';

// Avisa quando o Zela foi publicado de novo enquanto a pessoa estava com ele
// aberto. Sem isso, quem deixa a aba aberta por dias continua numa versão
// antiga, que pode dar erro depois de uma mudança no banco.
// O build grava /version.json e a constante __APP_BUILD__ (vite.config.js).

/* global __APP_BUILD__ */
const CURRENT_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : null;
const CHECK_EVERY_MS = 5 * 60 * 1000;

// Pura pra teste: true só quando dá pra comparar e o build publicado é outro.
export async function hasNewerBuild(currentBuild, fetchFn = fetch) {
  if (!currentBuild) return false;
  try {
    const res = await fetchFn(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.build) && data.build !== currentBuild;
  } catch {
    return false;
  }
}

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD || import.meta.env.DEV) return undefined;
    let stopped = false;
    const check = async () => {
      if (stopped || updateAvailable) return;
      if (await hasNewerBuild(CURRENT_BUILD)) setUpdateAvailable(true);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [updateAvailable]);

  return updateAvailable;
}
