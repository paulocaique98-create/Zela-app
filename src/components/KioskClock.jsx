import React, { useState, useEffect } from 'react';

// Relógio ao vivo do Autoatendimento — hora com segundos, pra quem está
// fazendo check-in/check-out ver exatamente o horário que vai ser
// registrado. Isolado num componente próprio: só ELE re-renderiza a cada
// segundo, o resto da tela do totem (que fica ligada o dia inteiro) não é
// afetado por essa atualização.
export default function KioskClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="px-6 py-5 sm:py-7 text-center">
      <div className="font-extralight text-[40px] sm:text-[60px] tracking-wide text-on-surface leading-none [font-variant-numeric:tabular-nums]">
        {time}
      </div>
      <div className="mt-2 text-[11px] sm:text-xs font-medium uppercase tracking-widest text-on-surface-variant">
        {date}
      </div>
    </div>
  );
}
