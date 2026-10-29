import React, { useEffect, useState } from 'react';
import { NotebookPen, Loader2, CheckCircle2 } from 'lucide-react';
import { TIPOS, GRAVIDADES, MEDIDAS, GRAVIDADE_TOM, dataBR, minhasOcorrencias, darCiencia, pendenteDeCiencia } from '../lib/ocorrencias';

// Família › Ocorrências (módulo `ocorrencias`). Só o que a escola marcou como
// visível à família, dos próprios filhos (RPC ocorrencias_minhas). A única
// escrita possível é a ciência (RPC registrar_ciencia_ocorrencia).
export default function FamilyOcorrencias() {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(null);

  const carregar = () => minhasOcorrencias()
    .then(setLinhas)
    .catch(() => { setErro('Não foi possível carregar as ocorrências.'); setLinhas([]); });

  useEffect(() => { carregar(); }, []);

  const confirmar = async (id) => {
    setConfirmando(id);
    setErro('');
    try { await darCiencia(id); await carregar(); } catch { setErro('Não foi possível registrar a ciência. Tente de novo.'); }
    setConfirmando(null);
  };

  if (linhas === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <NotebookPen size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Ocorrências</h2>
      </div>
      {erro && <p className="text-sm text-warning">{erro}</p>}
      {linhas.length === 0 && !erro ? (
        <p className="text-sm text-on-surface-variant">Nenhuma ocorrência para mostrar.</p>
      ) : (
        <ul className="space-y-2">
          {linhas.map(o => (
            <li key={o.id} className={`bg-surface-container-lowest border rounded-zela-lg p-3.5 ${pendenteDeCiencia(o) ? 'border-warning' : 'border-outline-variant'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-on-surface">{o.student_name}</p>
                <span className="text-xs font-semibold text-on-surface-variant tabular-nums shrink-0">{dataBR(o.ocorrido_em)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-primary/10 text-primary">{TIPOS[o.tipo] || o.tipo}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm ${GRAVIDADE_TOM[o.gravidade] || ''}`}>{GRAVIDADES[o.gravidade] || o.gravidade}</span>
                {o.medida && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-warning/15 text-warning">{MEDIDAS[o.medida]}{o.medida_inicio ? `, ${dataBR(o.medida_inicio)}${o.medida_fim ? ` a ${dataBR(o.medida_fim)}` : ''}` : ''}</span>}
              </div>
              <p className="text-sm text-on-surface mt-2 whitespace-pre-wrap break-words">{o.descricao}</p>
              {o.providencias && <p className="text-xs text-on-surface-variant mt-2 whitespace-pre-wrap break-words"><span className="font-semibold">Providências:</span> {o.providencias}</p>}
              {o.exige_ciencia && (o.ciencia_em ? (
                <p className="mt-2 text-xs font-semibold text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> Ciência registrada em {dataBR(o.ciencia_em)}</p>
              ) : (
                <button onClick={() => confirmar(o.id)} disabled={confirmando === o.id}
                  className="mt-3 w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-container text-white font-semibold rounded-zela-md text-sm disabled:opacity-60">
                  {confirmando === o.id ? 'Registrando...' : 'Li e estou ciente'}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
