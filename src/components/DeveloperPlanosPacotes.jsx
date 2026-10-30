import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { brl } from '../lib/planosZela';
import { IMPOSTO_PADRAO, custoPorAlunoDoPlano, linhasDoPacote, reajustarCusto } from '../lib/pacotesFaixas';

// Portal do Dev · Planos · Pacotes. Preço final por faixa de alunos (zela_pacote_faixas). O dev edita
// só o custo por aluno do plano e o imposto; média, custo, custo total, lucro e margem são cálculo.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const th = 'px-3 py-2 text-left text-[11px] font-bold text-dev-text-muted whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap tabular-nums';
const MARGEM_PISO = 50;

const pct = (n) => `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function DeveloperPlanosPacotes({ dados }) {
  const pacotes = useMemo(() => dados.planos.filter(p => p.modalidade === 'pacote'), [dados.planos]);
  const [planoId, setPlanoId] = useState(null);
  const [extra, setExtra] = useState({ loading: true, erro: null, faixas: [], custos: {}, refs: {}, imposto: IMPOSTO_PADRAO });
  const [impostoTxt, setImpostoTxt] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ipcaTxt, setIpcaTxt] = useState('');

  // Lê numa consulta só do que esta aba precisa. Se a migration ainda não foi aplicada, mostra o aviso.
  const carregar = useCallback(async () => {
    const [faixas, planos, cfg] = await Promise.all([
      supabase.from('zela_pacote_faixas').select('plano_id, faixa, valor_final').limit(2000),
      supabase.from('zela_planos').select('id, custo_por_aluno, custo_referencia_faixas').eq('modalidade', 'pacote').limit(200),
      supabase.from('zela_config_comercial').select('imposto_percent').maybeSingle(),
    ]);
    const falha = [faixas, planos, cfg].find(r => r.error);
    const custos = {};
    const refs = {};
    for (const p of planos.data || []) { custos[p.id] = p.custo_por_aluno; refs[p.id] = p.custo_referencia_faixas; }
    setExtra({
      loading: false,
      erro: falha ? falha.error.message : null,
      faixas: faixas.data || [],
      custos,
      refs,
      imposto: cfg.data?.imposto_percent ?? IMPOSTO_PADRAO,
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const plano = pacotes.find(p => p.id === planoId) || pacotes[0] || null;

  // Preenche o imposto ao trocar de plano ou depois de salvar.
  useEffect(() => {
    if (!plano || extra.loading) return;
    setImpostoTxt(String(extra.imposto));
  }, [plano?.id, extra.loading, extra.custos, extra.imposto]); // eslint-disable-line react-hooks/exhaustive-deps

  const valores = useMemo(() => {
    const m = {};
    for (const f of extra.faixas) if (f.plano_id === plano?.id) m[f.faixa] = Number(f.valor_final);
    return m;
  }, [extra.faixas, plano?.id]);

  // Reajuste IPCA digitado vira prévia: o custo por aluno e a tabela já mostram o valor reajustado.
  const ipca = Number(String(ipcaTxt).replace(',', '.'));
  const ipcaOk = ipcaTxt !== '' && ipca !== 0 && ipca > -100 && ipca <= 100;
  const custoSalvo = plano ? custoPorAlunoDoPlano({ ...plano, custo_por_aluno: extra.custos[plano.id] }, dados.precos) : 0;
  const custo = ipcaOk ? reajustarCusto(custoSalvo, ipca) : custoSalvo;

  const imposto = Number(String(impostoTxt).replace(',', '.'));
  const entradaOk = impostoTxt !== '' && custo > 0 && imposto >= 0 && imposto <= 100;
  const custoRef = plano ? extra.refs[plano.id] : null;
  const linhas = useMemo(() => (entradaOk ? linhasDoPacote(valores, custo, imposto, custoRef) : []), [valores, custo, imposto, custoRef, entradaOk]);
  const sujo = entradaOk && imposto !== Number(extra.imposto);

  const salvar = async () => {
    if (!plano || !entradaOk) return toast.error('Informe o imposto entre 0 e 100.');
    setSalvando(true);
    const { error } = await supabase.from('zela_config_comercial').update({ imposto_percent: imposto }).eq('id', true);
    setSalvando(false);
    if (error) return toast.error(error.message || 'Não foi possível salvar.');
    toast.success('Imposto salvo. Contratações vigentes não mudam.');
    carregar();
  };

  // Reajuste IPCA: aplica o percentual ao custo salvo de todos os pacotes; o resto da tabela recalcula.

  const aplicarIpca = async () => {
    if (!ipcaOk) return toast.error('Informe um percentual diferente de zero, entre menos 100 e 100.');
    setSalvando(true);
    const resultados = await Promise.all(pacotes.map(p => {
      const atual = custoPorAlunoDoPlano({ ...p, custo_por_aluno: extra.custos[p.id] }, dados.precos);
      return supabase.from('zela_planos').update({ custo_por_aluno: reajustarCusto(atual, ipca) }).eq('id', p.id);
    }));
    setSalvando(false);
    const falha = resultados.find(r => r.error);
    if (falha) {
      toast.error(falha.error.message || 'Não foi possível aplicar o reajuste em todos os pacotes.');
    } else {
      toast.success(`Reajuste de ${pct(ipca)} aplicado ao custo por aluno de ${pacotes.length} pacote(s). Contratações vigentes não mudam.`);
      setIpcaTxt('');
    }
    carregar();
  };

  // Restaurar: devolve o custo por aluno de todos os pacotes com escada ao custo de referência (o original),
  // desfazendo reajustes IPCA acumulados. Os preços das faixas não mudam, só voltam a valer pelo custo de origem.
  const paraRestaurar = pacotes.filter(p => {
    const ref = Number(extra.refs[p.id]);
    return ref > 0 && extra.custos[p.id] != null && Number(extra.custos[p.id]) !== ref;
  });

  const restaurarCusto = async () => {
    if (paraRestaurar.length === 0) return;
    setSalvando(true);
    const resultados = await Promise.all(paraRestaurar.map(p =>
      supabase.from('zela_planos').update({ custo_por_aluno: extra.refs[p.id] }).eq('id', p.id)));
    setSalvando(false);
    const falha = resultados.find(r => r.error);
    if (falha) toast.error(falha.error.message || 'Não foi possível restaurar o custo de todos os pacotes.');
    else { toast.success(`Custo original restaurado em ${paraRestaurar.length} pacote(s). Contratações vigentes não mudam.`); setIpcaTxt(''); }
    carregar();
  };

  if (extra.loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-dev-text-muted" /></div>;
  if (extra.erro) {
    return <p className="text-sm text-warning">Não foi possível carregar os pacotes: {extra.erro}. Se a migration de faixas ainda não foi aplicada, este menu fica vazio até lá.</p>;
  }
  if (pacotes.length === 0) return <p className="text-sm text-dev-text-muted">Nenhum plano pacote cadastrado.</p>;

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div role="tablist" className="flex flex-wrap gap-2 sm:col-span-2">
            {pacotes.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={plano?.id === p.id} onClick={() => setPlanoId(p.id)}
                className={`px-4 py-2 rounded-zela-md text-sm font-medium border ${plano?.id === p.id ? 'border-dev-primary text-dev-primary bg-dev-primary-container' : 'border-dev-border text-dev-text-muted hover:text-dev-text'}`}>
                {p.nome}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 w-full">
            <div className="flex-1 min-w-0">
              <label className={rotulo} htmlFor="pac-ipca">Reajuste IPCA (%)</label>
              <input id="pac-ipca" type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 4" className={campo} value={ipcaTxt} onChange={e => setIpcaTxt(e.target.value)} />
            </div>
            <button type="button" className={btnPrimario} disabled={!ipcaOk || sujo || salvando} onClick={aplicarIpca}
              title={sujo ? 'Salve o custo antes de aplicar o reajuste.' : 'Aplica o percentual ao custo por aluno de todos os pacotes.'}>
              Aplicar
            </button>
            {paraRestaurar.length > 0 && (
              <button type="button" className={`${btnPrimario} w-full justify-center`} disabled={sujo || salvando} onClick={restaurarCusto}
                title="Volta o custo por aluno de todos os pacotes ao custo original da escada.">
                Restaurar custo original
              </button>
            )}
          </div>
        </div>
        {ipcaOk && (
          <p className="text-xs text-warning">
            Prévia do reajuste de {pct(ipca)}, ainda não aplicado. A tabela abaixo já mostra os novos valores. Clique em Aplicar para gravar em todos os pacotes.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className={rotulo} htmlFor="pac-custo">Custo por aluno (R$), muda só pelo reajuste IPCA</label>
            <input id="pac-custo" type="number" readOnly tabIndex={-1} value={custo.toFixed(2)}
              className={`${campo} cursor-not-allowed ${ipcaOk ? 'border-dev-primary text-dev-primary' : 'opacity-70'}`} />
            {ipcaOk && <p className="text-[11px] text-dev-primary mt-1">Prévia: {brl(custoSalvo)} vai para {brl(custo)}</p>}
          </div>
          <div>
            <label className={rotulo} htmlFor="pac-imposto">Imposto (%), vale para todos os pacotes</label>
            <input id="pac-imposto" type="number" inputMode="decimal" min="0" max="100" step="0.01" className={campo} value={impostoTxt} onChange={e => setImpostoTxt(e.target.value)} />
          </div>
          <button type="button" className={`${btnPrimario} justify-center min-h-[44px] sm:min-h-0`} disabled={!sujo || salvando} onClick={salvar}>
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-dev-text-muted">{entradaOk ? `O plano ${plano?.nome} ainda não tem preço final por faixa cadastrado.` : 'Informe custo e imposto válidos.'}</p>
      ) : (
        <div className={`${card} p-0 overflow-x-auto`}>
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-dev-border">
              <tr>
                <th className={th}>Faixa</th>
                <th className={th}>Média por aluno</th>
                <th className={th}>Valor final</th>
                <th className={th}>Custo</th>
                <th className={th}>Imposto {pct(imposto)}</th>
                <th className={th}>Custo total</th>
                <th className={th}>Lucro líquido</th>
                <th className={th}>Margem líquida</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.faixa} className="border-b border-dev-border/50 last:border-0">
                  <td className={`${td} font-medium`}>Até {l.faixa}</td>
                  <td className={td}>{brl(l.media)}</td>
                  <td className={`${td} font-medium`}>{brl(l.final)}</td>
                  <td className={td}>{brl(l.custo)}</td>
                  <td className={td}>{brl(l.imposto)}</td>
                  <td className={td}>{brl(l.custoTotal)}</td>
                  <td className={td}>{brl(l.lucro)}</td>
                  <td className={`${td} ${l.margem < MARGEM_PISO ? 'text-warning' : ''}`}>{pct(l.margem)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
