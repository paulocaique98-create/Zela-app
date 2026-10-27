import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { carregarConfig, salvarConfig, TIPOS_PERIODO, CONFIG_PADRAO } from './lib/avaliacao';
import { mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';

// Fase 2 do Método Tradicional: período e média mínima da escola.
export default function ConfigAvaliacao({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [config, setConfig] = useState({ ...CONFIG_PADRAO });
  const [mediaTexto, setMediaTexto] = useState(String(CONFIG_PADRAO.media_minima).replace('.', ','));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const c = await carregarConfig(schoolId);
        if (!ativo) return;
        setConfig(c);
        setMediaTexto(String(c.media_minima).replace('.', ','));
      } catch (e) {
        if (ativo) setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  const salvar = async () => {
    const media = Number(mediaTexto.replace(',', '.'));
    if (!Number.isFinite(media) || media < 0 || media > 10) {
      setMsg({ tipo: 'erro', texto: 'A média mínima precisa estar entre 0 e 10.' });
      return;
    }
    setSalvando(true);
    try {
      await salvarConfig(schoolId, { periodo_tipo: config.periodo_tipo, media_minima: Math.round(media * 10) / 10 });
      setMsg({ tipo: 'ok', texto: 'Configuração salva.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Avaliação</h2>
      </div>
      {msg.texto && (
        <p className={`text-sm rounded-zela-md p-3 ${msg.tipo === 'erro' ? 'text-error bg-error/10' : 'text-primary bg-primary/10'}`}>{msg.texto}</p>
      )}
      <div className="bg-surface-container-low rounded-zela-md p-4 space-y-4">
        <label className="block text-sm font-bold text-on-surface">
          Divisão do ano letivo
          <select className={`${campo} mt-1 font-normal`} value={config.periodo_tipo}
            onChange={e => setConfig({ ...config, periodo_tipo: e.target.value })}>
            {TIPOS_PERIODO.map(t => <option key={t.value} value={t.value}>{t.label} ({t.quantidade} períodos)</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-on-surface">
          Média mínima
          <input className={`${campo} mt-1 font-normal`} inputMode="decimal" value={mediaTexto}
            onChange={e => setMediaTexto(e.target.value)} />
        </label>
        <p className="text-xs text-on-surface-variant">
          A nota de recuperação substitui a nota do período. As provas e os trabalhos são lançados pelo professor, com peso.
        </p>
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
          {salvando && <Loader2 size={16} className="animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}
