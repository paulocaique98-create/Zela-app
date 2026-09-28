import { useEffect, useState } from 'react';

// true/false conforme a conexão do aparelho. Usado pela faixa "Sem conexão"
// no App.jsx: sem ela, uma ação feita offline só falhava com um erro
// genérico, sem a pessoa entender o motivo.
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
