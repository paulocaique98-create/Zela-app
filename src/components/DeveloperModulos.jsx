import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Lock, BookOpen, Sun, Wallet, ScanFace, QrCode, Smartphone, ShieldAlert, Cpu, AlertTriangle, History, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import ConfirmModal from './ConfirmModal';
import {
  GRUPOS, ITENS, ITEM_POR_ID, PACOTES, estadoDoItem, ligarItem, normalizarFeatures, pacoteAtual, aplicarPacote, historicoDoItem,
} from '../lib/modulosCatalogo';

// Portal do Dev · Módulos contratados · Modelo 3 (Lista e detalhe, aprovado
// em 28/09/2026). À esquerda o pacote e a lista agrupada (Base, Módulos,
// Adicionais, Técnico); à direita o detalhe do item: o que inclui, onde
// aparece em cada portal, o que acontece ao desligar e o histórico
// (school_feature_changes, gravado por trigger). As regras ficam em
// src/lib/modulosCatalogo.js; os preços dos pacotes ainda não existem.

const ICONES = {
  base: Lock, pedagogico: BookOpen, rotina: Sun, financeiro: Wallet, liveness: ScanFace, qr: QrCode,
  app_marca: Smartphone, liveness_bloqueio: ShieldAlert, motor_human: Cpu,
};

const ESTADO_LABEL = { on: 'Ligado', off: 'Desligado', parcial: 'Parcial' };
const ESTADO_DOT = { on: 'bg-emerald-400', off: 'bg-slate-600', parcial: 'bg-amber-400' };

function statusDoItem(features, item) {
  if (item.fixo) return { label: 'Sempre', dot: 'bg-slate-400' };
  if (item.emBreve) return { label: 'Em breve', dot: 'border border-dashed border-slate-500' };
  const e = estadoDoItem(features, item);
  return { label: ESTADO_LABEL[e], dot: ESTADO_DOT[e], estado: e };
}

function Switch({ on, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-[26px] rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-dev-primary' : 'bg-dev-surface-high'}`}
    >
      <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[21px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

function Secao({ titulo, children }) {
  return (
    <section className="bg-dev-bg border border-dev-surface-high rounded-zela-lg p-4 flex flex-col gap-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-dev-text-muted">{titulo}</p>
      {children}
    </section>
  );
}

function formatarQuando(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export default function DeveloperModulos({ school, onBack, onSaved }) {
  const original = useMemo(() => school.features_enabled || {}, [school]);
  const [draft, setDraft] = useState(() => normalizarFeatures(original));
  const [selectedId, setSelectedId] = useState('pedagogico');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [changes, setChanges] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    const { data, error } = await supabase
      .from('school_feature_changes')
      .select('feature_key, enabled, changed_at, changed_by_name')
      .eq('school_id', school.id)
      .order('changed_at', { ascending: false })
      .limit(1000);
    if (error) console.error('[DeveloperModulos] Erro ao carregar histórico:', error);
    setChanges(data || []);
    setIsLoadingHistory(false);
  };
  useEffect(() => { loadHistory(); }, [school.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chaves que vão mudar ao salvar (inclui plano base que estivesse desligado).
  const alteradas = useMemo(
    () => ITENS.flatMap(i => i.keys).filter(k => draft[k] !== (original[k] === true)),
    [draft, original],
  );
  const itensAlterados = new Set(ITENS.filter(i => i.keys.some(k => alteradas.includes(k))).map(i => i.id));
  const pacote = pacoteAtual(draft);
  const item = ITEM_POR_ID[selectedId];

  const selecionar = (id) => { setSelectedId(id); setMobileDetail(true); };
  const voltar = () => (alteradas.length ? setConfirmLeave(true) : onBack());

  const salvar = async () => {
    setIsSaving(true);
    try {
      // Mantém chaves que o catálogo não conhece; só troca as do catálogo.
      const features_enabled = { ...original, ...draft };
      const { data, error } = await supabase.from('schools').update({ features_enabled }).eq('id', school.id).select().single();
      if (error) throw error;
      toast.success('Módulos salvos.');
      onSaved(data);
      await loadHistory();
    } catch (err) {
      console.error('[DeveloperModulos] Erro ao salvar:', err);
      toast.error(err.message || 'Não foi possível salvar os módulos.');
    } finally {
      setIsSaving(false);
    }
  };

  const status = statusDoItem(draft, item);
  const requisitoOk = !item.requer || estadoDoItem(draft, ITEM_POR_ID[item.requer]) === 'on';
  const pacotesComItem = PACOTES.filter(p => p.itens.includes(item.id)).map(p => p.nome);
  const historico = historicoDoItem(changes, item);
  const Icone = ICONES[item.id] || Lock;

  const lista = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-dev-text-muted">Pacote</p>
        <div className="flex bg-dev-bg border border-dev-surface-high rounded-zela-md p-[3px] gap-0.5" role="group" aria-label="Pacote">
          {PACOTES.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDraft(d => aplicarPacote(d, p.id))}
              aria-pressed={pacote === p.id}
              className={`flex-1 min-h-[36px] rounded-[9px] text-xs font-bold transition ${pacote === p.id ? 'bg-dev-primary text-dev-bg' : 'text-dev-text-muted hover:text-dev-text'}`}
            >
              {p.nome}
            </button>
          ))}
          <span className={`flex-1 min-h-[36px] rounded-[9px] text-xs font-bold flex items-center justify-center ${pacote === 'livre' ? 'bg-dev-surface-high text-dev-text' : 'text-dev-text-muted/60'}`}>Livre</span>
        </div>
        <p className="text-[11px] text-dev-text-muted">
          {pacote === 'livre' ? 'Combinação fora dos pacotes.' : `Pacote ${PACOTES.find(p => p.id === pacote).nome}: plano base${PACOTES.find(p => p.id === pacote).itens.map(id => ` + ${ITEM_POR_ID[id].nome}`).join('')}.`}
        </p>
      </div>

      {GRUPOS.map(g => (
        <div key={g.key} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-dev-text-muted">{g.label}</p>
          {ITENS.filter(i => i.grupo === g.key).map(i => {
            const st = statusDoItem(draft, i);
            const ativo = i.id === selectedId;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => selecionar(i.id)}
                aria-current={ativo ? 'true' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 min-h-[46px] rounded-zela-md text-left transition ${ativo ? 'md:bg-dev-primary-container md:ring-1 md:ring-dev-primary/40' : 'hover:bg-dev-surface-high/60'}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} aria-hidden="true" />
                <span className={`flex-1 min-w-0 truncate text-sm font-bold ${i.emBreve ? 'text-dev-text-muted' : 'text-dev-text'}`}>{i.nome}</span>
                {itensAlterados.has(i.id) && <span className="text-[10px] font-bold text-amber-300">alterado</span>}
                <span className="text-xs text-dev-text-muted whitespace-nowrap">{st.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const detalhe = (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-zela-md bg-dev-primary-container text-dev-primary flex items-center justify-center shrink-0"><Icone size={22} /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-extrabold text-dev-text truncate">{item.nome}</h2>
          <p className="text-xs text-dev-text-muted">
            {item.resumo}
            {pacotesComItem.length > 0 && ` · Nos pacotes ${pacotesComItem.join(' e ')}`}
          </p>
        </div>
        {!item.fixo && !item.emBreve && (
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden sm:inline text-sm font-bold text-dev-text">{status.label}</span>
            <Switch
              on={status.estado === 'on'}
              disabled={!requisitoOk && status.estado !== 'on'}
              onChange={v => setDraft(d => ligarItem(d, item.id, v))}
              label={item.nome}
            />
          </div>
        )}
      </div>

      {status.estado === 'parcial' && (
        <p className="flex gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-zela-md p-3">
          <AlertTriangle size={15} className="shrink-0 mt-px" /> Só parte deste módulo está ligada (configuração antiga). Ao ligar, entra inteiro.
        </p>
      )}
      {!requisitoOk && (
        <p className="flex gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-zela-md p-3">
          <AlertTriangle size={15} className="shrink-0 mt-px" /> Depende de "{ITEM_POR_ID[item.requer].nome}" ligado.
        </p>
      )}

      {item.emBreve ? (
        <Secao titulo="Em breve"><p className="text-sm text-dev-text">Este adicional chega junto com os apps. Por enquanto não há nada para ligar.</p></Secao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Secao titulo="O que inclui">
            {item.inclui.map(inc => (
              <div key={inc.nome} className="py-2 border-t border-dev-surface-high first-of-type:border-t-0">
                <p className="text-sm font-bold text-dev-text">{inc.nome}</p>
                <p className="text-xs text-dev-text-muted">{inc.desc}</p>
              </div>
            ))}
          </Secao>
          <Secao titulo="Onde aparece">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {item.onde.map(o => (
                  <tr key={o.portal} className="border-t border-dev-surface-high first:border-t-0">
                    <td className="py-2 pr-3 font-bold text-dev-text align-top whitespace-nowrap">{o.portal}</td>
                    <td className="py-2 text-dev-text-muted">{o.menus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
          {(item.aviso || item.aoDesligar) && (
            <Secao titulo="Atenção">
              {item.aviso && <p className="text-sm text-dev-text">{item.aviso}</p>}
              {item.aoDesligar && <p className="text-sm text-amber-300"><strong>Ao desligar:</strong> {item.aoDesligar}</p>}
            </Secao>
          )}
          <Secao titulo="Histórico">
            {isLoadingHistory ? (
              <Loader2 size={18} className="animate-spin text-dev-text-muted" />
            ) : historico.length === 0 ? (
              <p className="text-sm text-dev-text-muted flex items-center gap-2"><History size={15} /> Nenhuma mudança registrada. O histórico começou em 28/09/2026.</p>
            ) : (
              historico.slice(0, 8).map(h => (
                <div key={`${h.quando}-${h.ligado}`} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1.5 border-t border-dev-surface-high first-of-type:border-t-0 text-sm">
                  <span className="text-dev-text">
                    {h.ligado ? 'Ligado' : 'Desligado'}
                    {!h.completo && <span className="text-dev-text-muted"> · só {h.chaves.join(', ')}</span>}
                  </span>
                  <span className="text-dev-text-muted text-xs">{formatarQuando(h.quando)} · {h.autor || 'sistema'}</span>
                </div>
              ))
            )}
          </Secao>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-dev-surface -m-3 sm:m-0 overflow-hidden text-dev-text">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-dev-border bg-dev-bg shrink-0">
        <button
          type="button"
          onClick={() => (mobileDetail ? setMobileDetail(false) : voltar())}
          className="md:hidden w-10 h-10 -ml-2 rounded-zela-md flex items-center justify-center text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high"
          aria-label={mobileDetail ? 'Voltar para a lista de módulos' : 'Voltar para as escolas'}
        >
          <ArrowLeft size={20} />
        </button>
        <button type="button" onClick={voltar} className="hidden md:flex items-center gap-1.5 text-sm font-bold text-dev-primary hover:underline">
          <ArrowLeft size={16} /> Escolas
        </button>
        <div className="min-w-0 flex-1 md:pl-3 md:border-l md:border-dev-surface-high">
          <h1 className="text-base sm:text-lg font-extrabold truncate">Módulos contratados</h1>
          <p className="text-xs text-dev-text-muted truncate">{school.name} · {school.school_code}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className={`${mobileDetail ? 'hidden' : 'flex'} md:flex w-full md:w-[320px] lg:w-[360px] shrink-0 flex-col md:border-r border-dev-border bg-dev-bg/40 overflow-y-auto scrollbar-none p-4`}>
          {lista}
        </aside>
        <main className={`${mobileDetail ? 'block' : 'hidden'} md:block flex-1 min-w-0 overflow-y-auto scrollbar-none p-4 sm:p-6`}>
          {detalhe}
        </main>
      </div>

      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-t border-dev-border bg-dev-bg shrink-0">
        <div className="flex-1 min-w-0">
          {alteradas.length ? (
            <p className="text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> {itensAlterados.size} {itensAlterados.size === 1 ? 'item alterado' : 'itens alterados'} · não salvo</p>
          ) : (
            <p className="text-sm text-dev-text-muted truncate">{pacote === 'livre' ? 'Combinação livre' : `Pacote ${PACOTES.find(p => p.id === pacote).nome}`} · tudo salvo</p>
          )}
        </div>
        {alteradas.length > 0 && (
          <button type="button" onClick={() => setDraft(normalizarFeatures(original))} disabled={isSaving} className="hidden sm:block min-h-[40px] px-4 rounded-zela-md border border-dev-surface-high text-sm font-bold text-dev-text-muted hover:text-dev-text">
            Descartar
          </button>
        )}
        <button
          type="button"
          onClick={salvar}
          disabled={!alteradas.length || isSaving}
          className="min-h-[40px] px-4 rounded-zela-md bg-dev-primary text-dev-bg text-sm font-extrabold hover:brightness-110 disabled:opacity-40 flex items-center gap-2"
        >
          {isSaving && <Loader2 size={15} className="animate-spin" />} Salvar alterações
        </button>
      </div>

      {confirmLeave && (
        <ConfirmModal
          title="Sair sem salvar?"
          message="As mudanças nos módulos desta escola ainda não foram salvas e serão perdidas."
          confirmLabel="Sair sem salvar"
          onConfirm={() => { setConfirmLeave(false); onBack(); }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
