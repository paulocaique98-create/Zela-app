import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import { rotuloDaNota, pendenciasDaEscola, montarConfigFiscal, CAMPOS_ALIQUOTA } from '../lib/nfse';
import { Tabs, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, EmptyState, Loading, Notice } from './GestaoShared';

// Nota fiscal de serviço (item 15). Só a Gestão (a RLS barra os outros). Vale para qualquer município:
// código do serviço e alíquotas são da escola, sem valor padrão de imposto. A nota só liga depois que
// a escola confirma as alíquotas (o banco exige). Quem emite é o Asaas; aqui se configura e se acompanha.
const CHIP = 'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap';
const TOM_CLS = {
  ok: 'bg-success/10 text-success border-success/30',
  alerta: 'bg-brass text-ink border-brass',
  neutro: 'bg-surface-container text-on-surface-variant border-outline-variant',
};
const brl = (cents) => (cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const FORM_VAZIO = {
  municipal_service_id: '', municipal_service_name: '', observacoes: '', retain_iss: false, emitir_avulsas: false,
  iss_percent: '', pis_percent: '0', cofins_percent: '0', csll_percent: '0', inss_percent: '0', ir_percent: '0',
};

function Aviso({ children }) {
  return <div className="p-2.5 rounded-zela-md text-sm font-medium border border-brass bg-brass/20 text-ink">{children}</div>;
}

export default function GestaoNfse({ currentUser }) {
  const schoolId = currentUser.school_id;
  const [aba, setAba] = useState('config');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [escola, setEscola] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [ativo, setAtivo] = useState(false);
  const [confirmadaEm, setConfirmadaEm] = useState(null);
  const [notas, setNotas] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  const [issRef, setIssRef] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [s, c, n, k] = await Promise.all([
      supabase.from('schools').select('codigo_ibge, inscricao_municipal, city').eq('id', schoolId).maybeSingle(),
      supabase.from('school_fiscal_config')
        .select('ativo, municipal_service_id, municipal_service_name, observacoes, iss_percent, retain_iss, emitir_avulsas, pis_percent, cofins_percent, csll_percent, inss_percent, ir_percent, aliquotas_confirmadas_em')
        .eq('school_id', schoolId).maybeSingle(),
      supabase.from('financial_invoices')
        .select('id, status, invoice_number, pdf_url, xml_url, value_cents, error_reason, updated_at, financial_charges:charge_id(due_date, students:student_id(name))')
        .eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(60),
      supabase.from('financial_contracts')
        .select('id, nfse_erro, students:student_id(name)')
        .eq('school_id', schoolId).eq('status', 'active').not('gateway_subscription_id', 'is', null)
        .is('nfse_configurada_em', null).limit(200),
    ]);
    if (s.error || c.error || n.error || k.error) setErro('Não foi possível carregar a nota fiscal.'); else setErro('');
    setEscola(s.data || null);
    if (c.data) {
      setForm({
        municipal_service_id: c.data.municipal_service_id || '', municipal_service_name: c.data.municipal_service_name || '',
        observacoes: c.data.observacoes || '', retain_iss: c.data.retain_iss, emitir_avulsas: c.data.emitir_avulsas,
        iss_percent: c.data.iss_percent == null ? '' : String(c.data.iss_percent),
        pis_percent: String(c.data.pis_percent), cofins_percent: String(c.data.cofins_percent),
        csll_percent: String(c.data.csll_percent), inss_percent: String(c.data.inss_percent), ir_percent: String(c.data.ir_percent),
      });
      setAtivo(c.data.ativo); setConfirmadaEm(c.data.aliquotas_confirmadas_em);
    }
    setNotas(n.data || []); setContratos(k.data || []);
    setCarregando(false);
  }, [schoolId]);
  useEffect(() => { carregar(); }, [carregar]);

  const muda = (patch) => setForm(f => ({ ...f, ...patch }));
  const pendencias = pendenciasDaEscola(escola);

  const salvar = async ({ confirmar = false, ativar = ativo } = {}) => {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const registro = montarConfigFiscal(form, { confirmar, ativar });
      const { error } = await supabase.from('school_fiscal_config').upsert({
        school_id: schoolId, ...registro, ativo: ativar,
        ...(confirmar ? { aliquotas_confirmadas_em: new Date().toISOString() } : {}),
      }, { onConflict: 'school_id' });
      if (error) throw error;
      setAviso(ativar ? 'Configuração salva e nota fiscal ligada.' : confirmar ? 'Alíquotas confirmadas.' : 'Configuração salva.');
      await carregar();
    } catch (e) { setErro(e.message || 'Não foi possível salvar.'); }
    setOcupado(false);
  };

  const buscarServico = async () => {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await chamarFuncaoFinanceira('list-municipal-services', { busca });
      setAchados(r.servicos || []);
      if (!r.servicos?.length) setAviso('Nenhum serviço encontrado. Tente outra palavra.');
    } catch (e) { setErro(e.message || 'Não foi possível buscar os serviços.'); }
    setOcupado(false);
  };
  const escolherServico = (sv) => {
    muda({ municipal_service_id: sv.id, municipal_service_name: sv.description });
    setIssRef(sv.issTax); setAchados([]);
  };

  const ligarContratos = async (contractId) => {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await chamarFuncaoFinanceira('enable-contract-nfse', contractId ? { contract_id: contractId } : {});
      if (r.falhas?.length) setErro(`${r.configurados} de ${r.total} contratos ligados. ${r.falhas[0].motivo}`);
      else setAviso(`${r.configurados} de ${r.total} contratos ligados.`);
      await carregar();
    } catch (e) { setErro(e.message || 'Não foi possível ligar a nota.'); }
    setOcupado(false);
  };

  if (carregando) return <Loading />;

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto h-full">
      <Tabs tabs={[{ id: 'config', label: 'Configuração' }, { id: 'notas', label: 'Notas' }, { id: 'contratos', label: 'Contratos' }]} active={aba} onChange={setAba} equalOnMobile />
      <Notice type="error">{erro}</Notice>
      <Notice type="ok">{aviso}</Notice>

      {aba === 'config' && (
        <div className="space-y-4 max-w-2xl">
          {pendencias.length > 0 && <Aviso>Antes de ligar, preencha no cadastro da escola: {pendencias.join(' e ')}.</Aviso>}
          <Aviso>A nota é emitida pelo Asaas na prefeitura do município da escola. Confirme com o Asaas que o seu município é atendido e que o certificado digital está ativo na conta antes de ligar.</Aviso>
          <p className="text-sm text-on-surface-variant">Município (IBGE): {escola?.codigo_ibge || 'não informado'}{escola?.city ? ` · ${escola.city}` : ''}. Os valores abaixo devem ser confirmados com a contabilidade da escola; o Zela não sugere alíquota.</p>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-on-surface-variant">Serviço da nota</p>
            <p className="text-sm text-on-surface">{form.municipal_service_name ? form.municipal_service_name : 'Nenhum serviço escolhido.'}</p>
            <div className="flex gap-2">
              <input id="nf-busca" className={inputCls} placeholder="Buscar, ex.: ensino" value={busca} onChange={e => setBusca(e.target.value)} />
              <SecondaryButton disabled={ocupado || busca.trim().length < 3} onClick={buscarServico}>Buscar</SecondaryButton>
            </div>
            {achados.length > 0 && (
              <ul className="border border-outline-variant rounded-zela-md divide-y divide-outline-variant/50">
                {achados.map(sv => (
                  <li key={sv.id}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10" onClick={() => escolherServico(sv)}>{sv.description}{sv.issTax != null ? ` · ISS de referência ${sv.issTax}%` : ''}</button></li>
                ))}
              </ul>
            )}
            {issRef != null && <p className="text-xs text-on-surface-variant">A prefeitura indica ISS de referência de {issRef}% para este serviço. Confirme o valor com a contabilidade antes de preencher.</p>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CAMPOS_ALIQUOTA.map(c => (
              <Field key={c.chave} label={c.rotulo} id={`nf-${c.chave}`}>
                <input id={`nf-${c.chave}`} className={inputCls} inputMode="decimal" value={form[c.chave]} placeholder={c.obrigatorio ? 'obrigatório' : '0'} onChange={e => muda({ [c.chave]: e.target.value })} />
              </Field>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.retain_iss} onChange={e => muda({ retain_iss: e.target.checked })} /> ISS retido pelo tomador</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.emitir_avulsas} onChange={e => muda({ emitir_avulsas: e.target.checked })} /> Emitir nota também nas cobranças avulsas (matrícula, eventos)</label>
          <Field label="Texto da nota (opcional)" id="nf-obs" hint="Se ficar vazio, sai Mensalidade escolar">
            <input id="nf-obs" className={inputCls} value={form.observacoes} maxLength={300} onChange={e => muda({ observacoes: e.target.value })} />
          </Field>
          <p className="text-xs text-on-surface-variant">{confirmadaEm ? `Alíquotas confirmadas em ${new Date(confirmadaEm).toLocaleDateString('pt-BR')}. Mudar qualquer valor pede nova confirmação.` : 'Alíquotas ainda não confirmadas.'}</p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton disabled={ocupado} onClick={() => salvar({ ativar: ativo })}>Salvar</SecondaryButton>
            {!ativo && <PrimaryButton disabled={ocupado || pendencias.length > 0} onClick={() => salvar({ confirmar: true, ativar: true })}>Confirmar com a contabilidade e ligar</PrimaryButton>}
            {ativo && <SecondaryButton disabled={ocupado} onClick={() => salvar({ confirmar: true, ativar: true })}>Reconfirmar alíquotas</SecondaryButton>}
            {ativo && <SecondaryButton disabled={ocupado} onClick={() => salvar({ ativar: false })}>Desligar</SecondaryButton>}
          </div>
          <p className="text-xs text-on-surface-variant">{ativo ? 'Nota fiscal ligada: contratos novos já saem com emissão automática.' : 'Nota fiscal desligada.'}</p>
        </div>
      )}

      {aba === 'notas' && (notas.length === 0 ? <EmptyState text="Nenhuma nota ainda." hint="As notas aparecem aqui depois que o Asaas as agenda." /> : (
        <ResponsiveTable rows={notas} columns={[
          { label: 'Aluno', primary: true, render: n => n.financial_charges?.students?.name || '' },
          { label: 'Situação', render: n => { const r = rotuloDaNota(n.status); return <span className={`${CHIP} ${TOM_CLS[r.tom]}`}>{r.texto}</span>; } },
          { label: 'Número', render: n => n.invoice_number || '' },
          { label: 'Valor', render: n => brl(n.value_cents) },
          { label: 'Motivo', render: n => n.error_reason || '' },
          { label: '', actions: true, render: n => (n.pdf_url || n.xml_url) && (
            <span className="flex gap-3 text-sm">
              {n.pdf_url && <a className="text-primary font-semibold" href={n.pdf_url} target="_blank" rel="noopener noreferrer">PDF</a>}
              {n.xml_url && <a className="text-primary font-semibold" href={n.xml_url} target="_blank" rel="noopener noreferrer">XML</a>}
            </span>
          ) },
        ]} />
      ))}

      {aba === 'contratos' && (
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">Contratos ativos que ainda não têm a nota automática configurada. Contratos novos já saem configurados quando a nota está ligada.</p>
          {!ativo && <Aviso>Ligue a nota fiscal na aba Configuração antes de configurar contratos.</Aviso>}
          {contratos.length === 0 ? <EmptyState text="Todos os contratos ativos já estão configurados." /> : (
            <>
              <PrimaryButton disabled={ocupado || !ativo} onClick={() => ligarContratos(null)}>Ligar nota em todos ({contratos.length})</PrimaryButton>
              <ResponsiveTable rows={contratos} columns={[
                { label: 'Aluno', primary: true, render: c => c.students?.name || '' },
                { label: 'Último aviso', render: c => c.nfse_erro || '' },
                { label: '', actions: true, render: c => <SecondaryButton disabled={ocupado || !ativo} onClick={() => ligarContratos(c.id)}>Ligar nota</SecondaryButton> },
              ]} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
