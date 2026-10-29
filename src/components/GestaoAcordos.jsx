import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, AlertCircle, Loader2, CheckCircle2, Handshake } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import { todayISO } from '../lib/gestaoUtils';
import { calcularAcordo, podeRomperAcordo, diasDeAtraso, STATUS_ACORDO, MAX_PARCELAS, DIAS_PARA_ROMPER } from '../lib/acordoDivida';
import { ResponsiveTable } from './GestaoShared';

// Negociação de dívida (item 10 do plano de expansão da Gestão). O cálculo mostrado aqui é só
// uma prévia: o servidor recalcula tudo em create-debt-agreement. Escrita sempre por Edge Function.
const brl = (cents) => ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR') : '·');
const inputCls = 'w-full p-2.5 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm';

const STATUS_CLS = {
  rascunho: 'bg-surface-container text-on-surface-variant border-outline-variant',
  aguardando_assinatura: 'bg-warning/10 text-warning border-warning/30',
  ativo: 'bg-primary/10 text-primary border-primary/30',
  quitado: 'bg-success/10 text-success border-success/30',
  rompido: 'bg-error/10 text-error border-error/30',
  cancelado: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

function centavos(texto) {
  const n = parseFloat(String(texto).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function Erro({ children }) {
  return (
    <div className="p-2 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error font-medium flex items-center gap-2">
      <AlertCircle size={16} className="shrink-0" /> {children}
    </div>
  );
}

// ─── Simulador e criação do acordo ────────────────────────────────────────
export function NegociarModal({ charge, currentUser, onClose, onDone }) {
  const [atrasadas, setAtrasadas] = useState(null);
  const [marcadas, setMarcadas] = useState([]);
  const [desconto, setDesconto] = useState('');
  const [parcelas, setParcelas] = useState(3);
  const [primeiro, setPrimeiro] = useState(todayISO());
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Só as atrasadas do mesmo aluno e responsável, e que ainda não estejam em outro acordo.
      const { data, error } = await supabase.from('financial_charges')
        .select('id, due_date, amount_cents')
        .eq('school_id', currentUser.school_id).eq('student_id', charge.student_id).eq('family_id', charge.family_id)
        .eq('status', 'OVERDUE').order('due_date').limit(60);
      if (!vivo) return;
      if (error) { setErro('Não foi possível carregar as cobranças atrasadas.'); setAtrasadas([]); return; }
      const ids = (data || []).map(c => c.id);
      const { data: emAcordo } = ids.length
        ? await supabase.from('debt_agreement_charges').select('charge_id').in('charge_id', ids).eq('ativa', true)
        : { data: [] };
      const bloqueadas = new Set((emAcordo || []).map(v => v.charge_id));
      const livres = (data || []).filter(c => !bloqueadas.has(c.id));
      setAtrasadas(livres);
      setMarcadas(livres.map(c => c.id));
    })();
    return () => { vivo = false; };
  }, [charge.student_id, charge.family_id, currentUser.school_id]);

  const valorOriginal = useMemo(
    () => (atrasadas || []).filter(c => marcadas.includes(c.id)).reduce((s, c) => s + c.amount_cents, 0),
    [atrasadas, marcadas],
  );
  const calculo = useMemo(() => calcularAcordo({
    valorOriginalCents: valorOriginal, descontoCents: centavos(desconto), parcelas: Number(parcelas),
    primeiroVencimento: primeiro, hoje: todayISO(),
  }), [valorOriginal, desconto, parcelas, primeiro]);

  const alternar = (id) => setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]));

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (calculo.erro) { setErro(calculo.erro); return; }
    setSalvando(true);
    try {
      await chamarFuncaoFinanceira('create-debt-agreement', {
        charge_ids: marcadas, desconto_cents: centavos(desconto), parcelas: Number(parcelas),
        primeiro_vencimento: primeiro, motivo: motivo.trim(),
      });
      onDone();
    } catch (err) {
      setErro(err.message || 'Não foi possível criar o acordo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-zela-xl shadow-lg p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg text-on-surface">Negociar dívida</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-md transition"><X size={18} /></button>
        </div>
        <p className="text-sm text-on-surface-variant mb-3">{charge.students?.name || 'Aluno'}. As cobranças escolhidas são trocadas por parcelas novas depois que a família assinar o termo.</p>

        {atrasadas === null ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div> : (
          <form onSubmit={enviar} className="space-y-3">
            <fieldset>
              <legend className="block text-xs font-bold text-on-surface-variant mb-1">Cobranças atrasadas</legend>
              {atrasadas.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhuma cobrança atrasada livre para acordo.</p> : (
                <ul className="space-y-1">
                  {atrasadas.map(c => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm p-2 rounded-zela-md border border-outline-variant cursor-pointer">
                        <input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} />
                        <span className="flex-1">Venceu em {dataBR(c.due_date)} ({diasDeAtraso(c.due_date, todayISO())} dias)</span>
                        <strong>{brl(c.amount_cents)}</strong>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ac-desc" className="block text-xs font-bold text-on-surface-variant mb-1">Desconto (R$)</label>
                <input id="ac-desc" type="text" inputMode="decimal" placeholder="0,00" value={desconto} onChange={e => setDesconto(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ac-parc" className="block text-xs font-bold text-on-surface-variant mb-1">Parcelas</label>
                <input id="ac-parc" type="number" min={1} max={MAX_PARCELAS} value={parcelas} onChange={e => setParcelas(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label htmlFor="ac-venc" className="block text-xs font-bold text-on-surface-variant mb-1">Primeiro vencimento</label>
                <input id="ac-venc" type="date" min={todayISO()} value={primeiro} onChange={e => setPrimeiro(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="ac-motivo" className="block text-xs font-bold text-on-surface-variant mb-1">Motivo (opcional)</label>
              <input id="ac-motivo" type="text" placeholder="Ex: Perda de renda da família" value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} />
              <p className="text-[11px] text-on-surface-variant/70 mt-1">O motivo fica na auditoria. A família não vê.</p>
            </div>

            <div className="rounded-zela-md border border-outline-variant p-3 bg-surface-container-low">
              <p className="text-xs font-bold text-on-surface-variant mb-1">Simulação</p>
              {calculo.erro ? <p className="text-sm text-on-surface-variant">{calculo.erro}</p> : (
                <>
                  <p className="text-sm">Original {brl(valorOriginal)}, acordado <strong>{brl(calculo.valorAcordadoCents)}</strong></p>
                  <ul className="mt-1 text-sm space-y-0.5 max-h-40 overflow-y-auto">
                    {calculo.parcelas.map(p => <li key={p.numero}>Parcela {p.numero}: {brl(p.amountCents)}, vence em {dataBR(p.dueDate)}</li>)}
                  </ul>
                </>
              )}
            </div>
            {erro && <Erro>{erro}</Erro>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={salvando} className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={salvando || Boolean(calculo.erro)} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Enviar proposta para assinatura'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Lista de acordos ─────────────────────────────────────────────────────
export function AcordosTab({ currentUser }) {
  const [acordos, setAcordos] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('debt_agreements')
      .select('id, status, valor_original_cents, desconto_cents, valor_acordado_cents, parcelas, primeiro_vencimento, created_at, contract_id, students:student_id(name), guardian:guardian_id(name)')
      .eq('school_id', currentUser.school_id).order('created_at', { ascending: false }).limit(100);
    if (error) { setErro('Erro ao buscar acordos: ' + error.message); setAcordos([]); return; }
    setAcordos(data || []);
  }, [currentUser.school_id]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-3">
      {erro && <Erro>{erro}</Erro>}
      {aviso && <div className="p-2 bg-success/10 border border-success/30 rounded-zela-md text-sm text-success font-medium flex items-center gap-2"><CheckCircle2 size={16} /> {aviso}</div>}
      {acordos === null ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
        : acordos.length === 0 ? (
          <div className="py-10 text-center text-on-surface-variant">
            <Handshake size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Nenhum acordo ainda.</p>
            <p className="text-xs">Use Negociar em uma cobrança atrasada para começar.</p>
          </div>
        ) : (
          <ResponsiveTable
            rows={acordos}
            columns={[
              { label: 'Aluno', primary: true, render: a => a.students?.name || '·' },
              { label: 'Responsável', render: a => a.guardian?.name || '·' },
              { label: 'Acordado', className: 'font-bold', render: a => `${a.parcelas}x, ${brl(a.valor_acordado_cents)}` },
              { label: 'Situação', render: a => <span className={`px-2 py-0.5 rounded-sm text-xs font-bold border ${STATUS_CLS[a.status]}`}>{STATUS_ACORDO[a.status]}</span> },
              { label: 'Criado em', render: a => new Date(a.created_at).toLocaleDateString('pt-BR') },
              { label: '', actions: true, align: 'right', render: a => <button onClick={() => setAberto(a)} className="text-xs font-bold text-primary hover:underline whitespace-nowrap">Ver detalhes</button> },
            ]}
          />
        )}
      {aberto && (
        <AcordoDetalheModal
          acordo={aberto}
          onClose={() => setAberto(null)}
          onChanged={(msg) => { setAberto(null); setAviso(msg); carregar(); }}
        />
      )}
    </div>
  );
}

function AcordoDetalheModal({ acordo, onClose, onChanged }) {
  const [parcelas, setParcelas] = useState(null);
  const [termo, setTermo] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [acao, setAcao] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from('debt_agreement_installments')
          .select('id, numero, amount_cents, due_date, financial_charges(status)').eq('agreement_id', acordo.id).order('numero'),
        acordo.contract_id ? supabase.from('contract_documents').select('status, signed_at, signer_name').eq('id', acordo.contract_id).maybeSingle() : { data: null },
      ]);
      if (!vivo) return;
      setParcelas(p || []);
      setTermo(t);
    })();
    return () => { vivo = false; };
  }, [acordo.id, acordo.contract_id]);

  const assinado = termo?.status === 'assinado';
  const lista = (parcelas || []).map(p => ({ ...p, dueDate: p.due_date, status: p.financial_charges?.status }));
  const podeRomper = acordo.status === 'ativo' && podeRomperAcordo(lista, todayISO());

  const executar = async (nome, corpo, nomeAcao, msg) => {
    setErro('');
    setAcao(nomeAcao);
    try {
      await chamarFuncaoFinanceira(nome, corpo);
      onChanged(msg);
    } catch (err) {
      setErro(err.message || 'Não foi possível concluir.');
    } finally {
      setAcao('');
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-zela-xl shadow-lg p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg text-on-surface">Acordo de {acordo.students?.name || 'aluno'}</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-md transition"><X size={18} /></button>
        </div>
        <p className="text-sm text-on-surface-variant mb-3">
          Original {brl(acordo.valor_original_cents)}, desconto {brl(acordo.desconto_cents)}, acordado <strong>{brl(acordo.valor_acordado_cents)}</strong> em {acordo.parcelas}x.
        </p>
        {acordo.status === 'aguardando_assinatura' && (
          <p className="text-sm mb-3">{assinado ? `Termo assinado por ${termo.signer_name} em ${new Date(termo.signed_at).toLocaleString('pt-BR')}. Falta ativar o acordo.` : 'A família ainda não assinou o termo.'}</p>
        )}
        {parcelas === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-primary" /></div> : (
          <ul className="text-sm space-y-1 mb-3">
            {lista.map(p => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-outline-variant/50 py-1">
                <span>Parcela {p.numero}, vence em {dataBR(p.due_date)}</span>
                <span className="font-bold">{brl(p.amount_cents)}{p.status ? ` · ${{ PAID: 'paga', OVERDUE: 'atrasada', CANCELLED: 'cancelada' }[p.status] || 'aberta'}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {erro && <Erro>{erro}</Erro>}
        {['aguardando_assinatura', 'ativo'].includes(acordo.status) && (
          <div className="mt-3 space-y-2">
            {assinado && acordo.status === 'aguardando_assinatura' && (
              <button disabled={Boolean(acao)} onClick={() => executar('activate-debt-agreement', { agreement_id: acordo.id }, 'ativar', 'Acordo ativado. As parcelas foram geradas.')}
                className="w-full bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {acao === 'ativar' ? <Loader2 size={16} className="animate-spin" /> : 'Ativar acordo'}
              </button>
            )}
            {(acordo.status === 'aguardando_assinatura' || podeRomper) && (
              <>
                <input type="text" aria-label="Motivo" placeholder={acordo.status === 'ativo' ? 'Motivo do rompimento' : 'Motivo do cancelamento'} value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} />
                <button disabled={Boolean(acao) || motivo.trim().length < 3}
                  onClick={() => executar('break-debt-agreement', { agreement_id: acordo.id, motivo: motivo.trim() }, 'encerrar', acordo.status === 'ativo' ? 'Acordo rompido. As cobranças originais voltaram a valer.' : 'Acordo cancelado.')}
                  className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {acao === 'encerrar' ? <Loader2 size={16} className="animate-spin" /> : (acordo.status === 'ativo' ? 'Romper acordo' : 'Cancelar acordo')}
                </button>
              </>
            )}
            {acordo.status === 'ativo' && !podeRomper && (
              <p className="text-xs text-on-surface-variant">O acordo só pode ser rompido quando uma parcela passa de {DIAS_PARA_ROMPER} dias de atraso.</p>
            )}
            {acordo.status === 'ativo' && podeRomper && (
              <p className="text-xs text-on-surface-variant">Ao romper, as cobranças originais voltam pelo valor cheio. O que a família já pagou em parcelas precisa ser abatido depois com Ajustar valor.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
