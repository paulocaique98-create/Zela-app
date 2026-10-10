import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Percent } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/auditLog';
import { centsToBRL, todayISO } from '../lib/gestaoUtils';
import { planoDoAluno, procurarPreco, rotuloDoPlano, mensagemSemPreco, ROTULO_PERIODICIDADE } from '../../supabase/functions/_shared/planPricing.ts';

// Condição financeira da família, dentro da ficha do aluno (04/10/2026):
// bolsista (não recebe cobrança) e desconto por periodicidade do responsável
// financeiro. É a mesma informação de Configurações · Financeiro, só que à
// vista na própria família. Também mostra o plano do aluno (ciclo e turno) e
// o preço da tabela de Planos do ano.
const PERIODICIDADES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'];

export default function CondicaoFinanceiraFamilia({ currentUser, student, guardianId, guardianName, temMensalidadeAtiva }) {
  const [carregado, setCarregado] = useState(false);
  const [bolsista, setBolsista] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [descontos, setDescontos] = useState({ MONTHLY: '0', QUARTERLY: '0', SEMIANNUALLY: '0', YEARLY: '0' });
  const [precos, setPrecos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const ano = Number(todayISO().slice(0, 4));

  useEffect(() => {
    if (!guardianId) { setCarregado(true); return undefined; }
    let ativo = true;
    (async () => {
      const [cond, desc, tabela] = await Promise.all([
        supabase.from('financial_guardian_conditions').select('bolsista, observacao').eq('school_id', currentUser.school_id).eq('guardian_id', guardianId).maybeSingle(),
        supabase.from('financial_billing_discounts').select('billing_cycle, discount_percent').eq('school_id', currentUser.school_id).eq('guardian_id', guardianId),
        supabase.from('school_plan_prices').select('school_year, ciclo_horas, turno, monthly_amount_cents').eq('school_id', currentUser.school_id).eq('school_year', ano),
      ]);
      if (!ativo) return;
      setBolsista(Boolean(cond.data?.bolsista));
      setObservacao(cond.data?.observacao || '');
      const d = { MONTHLY: '0', QUARTERLY: '0', SEMIANNUALLY: '0', YEARLY: '0' };
      for (const r of desc.data || []) d[r.billing_cycle] = String(r.discount_percent ?? 0).replace('.', ',');
      setDescontos(d);
      setPrecos(tabela.data || []);
      setCarregado(true);
    })();
    return () => { ativo = false; };
  }, [currentUser.school_id, guardianId, ano]);

  const plano = useMemo(() => planoDoAluno(student), [student]);
  const preco = procurarPreco(precos, ano, plano.ciclo, plano.turno);

  const salvar = async () => {
    setErro('');
    setAviso('');
    const linhas = [];
    for (const c of PERIODICIDADES) {
      const n = parseFloat(String(descontos[c] || '0').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n >= 100) { setErro(`Desconto ${ROTULO_PERIODICIDADE[c].toLowerCase()} inválido: use de 0 a 99,99.`); return; }
      linhas.push({
        school_id: currentUser.school_id, guardian_id: guardianId, billing_cycle: c, discount_percent: n,
        updated_by: currentUser.id, updated_at: new Date().toISOString(),
      });
    }
    setSalvando(true);
    try {
      const cond = await supabase.from('financial_guardian_conditions').upsert(
        { school_id: currentUser.school_id, guardian_id: guardianId, bolsista, observacao: observacao.trim() || null },
        { onConflict: 'school_id,guardian_id' },
      );
      if (cond.error) throw cond.error;
      const desc = await supabase.from('financial_billing_discounts').upsert(linhas, { onConflict: 'school_id,guardian_id,billing_cycle' });
      if (desc.error) throw desc.error;
      logAction({
        schoolId: currentUser.school_id, actorId: currentUser.id, action: 'update_family_financial_condition', entityType: 'financial_guardian_conditions', entityId: guardianId,
        details: { responsavel: guardianName, bolsista, descontos: Object.fromEntries(linhas.map(l => [l.billing_cycle, l.discount_percent])) },
      });
      setAviso('Condição da família salva. Vale para as próximas mensalidades; as que já existem não mudam.');
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  if (!guardianId) return null;
  return (
    <div className="space-y-3 pt-4 border-t border-outline-variant">
      <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant">Plano e condição da família</p>

      <div className="text-sm text-on-surface space-y-0.5">
        <p><strong>Plano do aluno:</strong> {rotuloDoPlano(plano.ciclo, plano.turno)}</p>
        <p className="text-on-surface-variant">
          {plano.faltando.length ? `Complete o ${plano.faltando.join(' e o ')} do aluno (Dados de matrícula) para usar a tabela de Planos.`
            : preco !== null ? `Preço da tabela de ${ano}: ${centsToBRL(preco)} por mês, antes do desconto.`
              : mensagemSemPreco(plano.ciclo, plano.turno, ano)}
        </p>
      </div>

      {!carregado ? <Loader2 size={18} className="animate-spin text-on-surface-variant" /> : (
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant">Responsável financeiro: <strong>{guardianName || '·'}</strong>. Vale para todos os filhos desta família.</p>
          <label className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <input type="checkbox" checked={bolsista} onChange={e => setBolsista(e.target.checked)} />
            Bolsista, sem cobrança de mensalidade
          </label>
          {bolsista && temMensalidadeAtiva && (
            <p className="text-xs text-warning bg-brass-50 border border-warning/40 rounded-zela-md p-2">Este aluno já tem mensalidade ativa. Marcar como bolsista não cancela a cobrança: cancele em Financeiro · Mensalidades.</p>
          )}
          <div>
            <label htmlFor="cond-obs" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Observação (só a escola vê)</label>
            <input id="cond-obs" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: bolsa integral 2026" className="w-full p-2.5 border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1 flex items-center gap-1"><Percent size={12} /> Desconto por periodicidade</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PERIODICIDADES.map(c => (
                <div key={c}>
                  <label htmlFor={`cond-desc-${c}`} className="block text-[10px] font-bold text-on-surface-variant/70 uppercase mb-0.5">{ROTULO_PERIODICIDADE[c]}</label>
                  <div className="relative">
                    <input id={`cond-desc-${c}`} value={descontos[c]} onChange={e => setDescontos(d => ({ ...d, [c]: e.target.value }))} inputMode="decimal" disabled={bolsista}
                      className="w-full p-2 pr-6 bg-white border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-on-surface-variant/70 mt-1">Hoje a escola cobra só o mensal; o desconto de trimestral, semestral e anual já fica guardado para quando a família optar por pagar assim.</p>
          </div>
          {erro && <p className="text-xs font-medium text-error">{erro}</p>}
          {aviso && <p className="text-xs font-medium text-success">{aviso}</p>}
          <button type="button" onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar condição da família
          </button>
        </div>
      )}
    </div>
  );
}
