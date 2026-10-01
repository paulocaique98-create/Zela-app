import { useEffect, useState } from 'react';
import { BUILD_ATUAL, buscarBuildPublicado } from '../lib/versaoDoApp';

// Avisa quando o Zela foi publicado de novo enquanto a pessoa estava com ele
// aberto. Sem isso, quem deixa a aba aberta por dias continua numa versão
// antiga, que pode dar erro depois de uma mudança no banco.
// O build grava /version.json e a constante __APP_BUILD__ (vite.config.js).

const CURRENT_BUILD = BUILD_ATUAL;
const CHECK_EVERY_MS = 5 * 60 * 1000;

// Pura pra teste: true só quando dá pra comparar e o build publicado é outro.
export async function hasNewerBuild(currentBuild, fetchFn = fetch) {
  if (!currentBuild) return false;
  const publicado = await buscarBuildPublicado(fetchFn);
  return Boolean(publicado) && publicado !== currentBuild;
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
