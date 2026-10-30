import React, { useState, useEffect } from 'react';
import { BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CANAIS } from '../lib/reguaCobranca';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';

// Preferência de canal dos lembretes de cobrança (item 14). Só aparece se a escola ligou a régua.
// O responsável pode desligar notificação ou e-mail; o servidor respeita antes de enviar.
export default function FamilyPreferenciasCobranca({ currentUser }) {
  const [ligado, setLigado] = useState(false);
  const [sair, setSair] = useState({});
  const [erro, setErro] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [s, p] = await Promise.all([
        supabase.from('schools').select('features_enabled').eq('id', currentUser.school_id).maybeSingle(),
        supabase.from('billing_channel_prefs').select('canal, optou_sair').eq('user_id', currentUser.id),
      ]);
      if (cancelado) return;
      setLigado(s.data?.features_enabled?.regua_cobranca === true);
      setSair(Object.fromEntries((p.data || []).map(x => [x.canal, x.optou_sair])));
      if (s.data?.features_enabled?.regua_cobranca === true) {
        chamarFuncaoFinanceira('sync-asaas-whatsapp', { acao: 'estado' }).then(r => { if (!cancelado) setWhatsapp(r.ligado === true); }).catch(() => {});
      }
    })();
    return () => { cancelado = true; };
  }, [currentUser.id, currentUser.school_id]);

  if (!ligado) return null;

  const alterna = async (canal) => {
    const proximo = !sair[canal];
    setErro('');
    setSair(s => ({ ...s, [canal]: proximo }));
    const { error } = await supabase.from('billing_channel_prefs').upsert(
      { user_id: currentUser.id, school_id: currentUser.school_id, canal, optou_sair: proximo },
      { onConflict: 'user_id,canal' },
    );
    if (error) { setSair(s => ({ ...s, [canal]: !proximo })); setErro('Não foi possível salvar. Tente de novo.'); return; }
    if (canal === 'whatsapp') chamarFuncaoFinanceira('sync-asaas-whatsapp', { acao: 'minha_preferencia' }).catch(() => setErro('Salvamos sua escolha, mas ela pode demorar a valer.'));
  };

  return (
    <div className="bg-white p-5 rounded-zela-xl shadow-sm border border-outline-variant h-full flex flex-col">
      <h3 className="font-bold text-base text-on-surface flex items-center gap-2 mb-4">
        <BellRing className="text-primary" size={18} /> Lembretes de cobrança
      </h3>
      <p className="text-xs text-on-surface-variant mb-3">Escolha como quer ser lembrado do vencimento das mensalidades.</p>
      <div className="space-y-2">
        {Object.entries(whatsapp ? { ...CANAIS, whatsapp: 'WhatsApp' } : CANAIS).map(([canal, nome]) => (
          <label key={canal} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!sair[canal]} onChange={() => alterna(canal)} /> {nome}
          </label>
        ))}
      </div>
      {erro && <p className="text-xs text-error mt-2">{erro}</p>}
    </div>
  );
}
