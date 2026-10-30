import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import {
  CANAIS, VARIAVEIS, PASSOS_PADRAO, MAX_PASSOS, rotuloDoPasso, modeloPadrao, preencher, variaveisDesconhecidas,
  validarPassos, validarHorario,
} from '../lib/reguaCobranca';
import { Tabs, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, EmptyState, Loading, Notice } from './GestaoShared';

// Régua de cobrança (item 14 do plano de expansão da Gestão). Só a Gestão (a RLS barra os outros).
// A tela só configura: quem envia é a função run-billing-rules, de hora em hora, e a chave única
// de billing_dispatches impede mensagem repetida. Canais desta versão: notificação e e-mail.
const CHIP = 'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap';
const STATUS_CLS = {
  enviado: 'bg-success/10 text-success border-success/30',
  falhou: 'bg-brass text-ink border-brass',
  ignorado: 'bg-surface-container text-on-surface-variant border-outline-variant',
};
const STATUS_TXT = { enviado: 'Enviado', falhou: 'Falhou', ignorado: 'Não enviado' };

export default function GestaoReguaCobranca({ currentUser }) {
  const schoolId = currentUser.school_id;
  const [aba, setAba] = useState('passos');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ativa, setAtiva] = useState(false);
  const [passos, setPassos] = useState(PASSOS_PADRAO);
  const [inicio, setInicio] = useState(8);
  const [fim, setFim] = useState(20);
  const [modelos, setModelos] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [r, m, e] = await Promise.all([
      supabase.from('billing_rules').select('ativa, passos, hora_inicio, hora_fim').eq('school_id', schoolId).maybeSingle(),
      supabase.from('billing_message_templates').select('id, canal, dias, assunto, texto').eq('school_id', schoolId).limit(100),
      supabase.from('billing_dispatches')
        .select('id, dias, canal, status, erro, enviado_em, financial_charges:charge_id(due_date, students:student_id(name))')
        .eq('school_id', schoolId).order('enviado_em', { ascending: false }).limit(50),
    ]);
    if (r.error || m.error || e.error) setErro('Não foi possível carregar a régua.');
    else setErro('');
    if (r.data) {
      setAtiva(r.data.ativa); setPassos(r.data.passos?.length ? r.data.passos : PASSOS_PADRAO);
      setInicio(r.data.hora_inicio); setFim(r.data.hora_fim);
    }
    setModelos(m.data || []); setEnvios(e.data || []);
    setCarregando(false);
  }, [schoolId]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvarRegra = async (proximaAtiva = ativa) => {
    setErro(''); setAviso(''); setSalvando(true);
    try {
      const limpos = validarPassos(passos);
      const h = validarHorario(inicio, fim);
      const { error } = await supabase.from('billing_rules').upsert({
        school_id: schoolId, ativa: proximaAtiva, passos: limpos, hora_inicio: h.inicio, hora_fim: h.fim, updated_by: currentUser.id,
      }, { onConflict: 'school_id' });
      if (error) throw error;
      setAtiva(proximaAtiva); setPassos(limpos);
      setAviso(proximaAtiva ? 'Régua salva e ligada.' : 'Régua salva e desligada.');
    } catch (e) { setErro(e.message || 'Não foi possível salvar a régua.'); }
    setSalvando(false);
  };

  const mudaPasso = (i, patch) => setPassos(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const alternaCanal = (i, canal) => setPassos(ps => ps.map((p, j) => {
    if (j !== i) return p;
    const tem = p.canais.includes(canal);
    return { ...p, canais: tem ? p.canais.filter(c => c !== canal) : [...p.canais, canal] };
  }));

  if (carregando) return <Loading />;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl">
      {erro && <Notice type="error">{erro}</Notice>}
      {aviso && <Notice type="success">{aviso}</Notice>}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-on-surface">{ativa ? 'Régua ligada' : 'Régua desligada'}</p>
          <p className="text-xs text-on-surface-variant">
            {ativa ? 'Enquanto estiver ligada, o lembrete de 2 dias antes do vencimento (Comunicação) não é enviado, para ninguém receber duas vezes.'
              : 'Ligue depois de conferir os passos e os textos. Só cobranças em aberto recebem mensagem; pagas, canceladas e em acordo ficam de fora.'}
          </p>
        </div>
        <PrimaryButton onClick={() => salvarRegra(!ativa)} disabled={salvando}>{ativa ? 'Desligar régua' : 'Salvar e ligar'}</PrimaryButton>
      </div>

      <Tabs tabs={[{ id: 'passos', label: 'Passos' }, { id: 'modelos', label: 'Textos' }, { id: 'envios', label: 'Envios' }]} active={aba} onChange={setAba} equalOnMobile />

      {aba === 'passos' && (
        <div className="space-y-3">
          <CartaoWhatsApp setErro={setErro} setAviso={setAviso} />
          {passos.map((p, i) => (
            <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-wrap items-end gap-4">
              <Field label="Dias (negativo é antes)" id={`passo-dias-${i}`} hint={rotuloDoPasso(p.dias)}>
                <input id={`passo-dias-${i}`} type="number" min="-30" max="60" value={p.dias}
                  onChange={e => mudaPasso(i, { dias: e.target.value === '' ? 0 : Math.trunc(Number(e.target.value)) })} className={`${inputCls} w-28`} />
              </Field>
              <div className="flex gap-4 pb-2">
                {Object.entries(CANAIS).map(([k, nome]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={p.canais.includes(k)} onChange={() => alternaCanal(i, k)} /> {nome}
                  </label>
                ))}
              </div>
              <SecondaryButton onClick={() => setPassos(ps => ps.filter((_, j) => j !== i))} disabled={passos.length <= 1}>Remover</SecondaryButton>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-4">
            <SecondaryButton onClick={() => setPassos(ps => [...ps, { dias: 1, canais: ['email'] }])} disabled={passos.length >= MAX_PASSOS}>Adicionar passo</SecondaryButton>
            <Field label="Enviar a partir das" id="regua-inicio"><input id="regua-inicio" type="number" min="0" max="23" value={inicio} onChange={e => setInicio(Number(e.target.value))} className={`${inputCls} w-24`} /></Field>
            <Field label="Até as" id="regua-fim" hint="Horário de Brasília."><input id="regua-fim" type="number" min="1" max="24" value={fim} onChange={e => setFim(Number(e.target.value))} className={`${inputCls} w-24`} /></Field>
            <PrimaryButton onClick={() => salvarRegra()} disabled={salvando}>Salvar passos</PrimaryButton>
          </div>
        </div>
      )}

      {aba === 'modelos' && <Modelos passos={passos} modelos={modelos} schoolId={schoolId} onSaved={carregar} setErro={setErro} setAviso={setAviso} />}

      {aba === 'envios' && (envios.length === 0 ? <EmptyState text="Nenhuma mensagem enviada ainda." hint="Os envios aparecem aqui depois que a régua rodar." /> : (
        <ResponsiveTable
          rows={envios}
          columns={[
            { label: 'Aluno', primary: true, render: e => e.financial_charges?.students?.name || '' },
            { label: 'Passo', render: e => rotuloDoPasso(e.dias) },
            { label: 'Canal', render: e => CANAIS[e.canal] },
            { label: 'Situação', render: e => <span className={`${CHIP} ${STATUS_CLS[e.status]}`}>{STATUS_TXT[e.status]}</span> },
            { label: 'Quando', render: e => new Date(e.enviado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
            { label: 'Observação', render: e => e.erro || '' },
          ]}
        />
      ))}
    </div>
  );
}

function Modelos({ passos, modelos, schoolId, onSaved, setErro, setAviso }) {
  const opcoes = useMemo(() => passos.flatMap(p => p.canais.map(c => ({ dias: p.dias, canal: c }))), [passos]);
  const [escolha, setEscolha] = useState(opcoes[0] ? `${opcoes[0].canal}:${opcoes[0].dias}` : '');
  const [canal, dias] = escolha ? [escolha.split(':')[0], Number(escolha.split(':')[1])] : [null, null];
  const salvo = modelos.find(m => m.canal === canal && m.dias === dias);
  const padrao = canal ? modeloPadrao(canal, dias) : { assunto: '', texto: '' };
  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setAssunto(salvo?.assunto ?? padrao.assunto); setTexto(salvo?.texto ?? padrao.texto); }, [escolha, modelos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!opcoes.length) return <EmptyState text="Nenhum passo com canal." hint="Configure os passos primeiro." />;
  const desconhecidas = variaveisDesconhecidas(`${assunto} ${texto}`);

  const salvar = async () => {
    setErro(''); setAviso(''); setOcupado(true);
    const { error } = await supabase.from('billing_message_templates').upsert({
      school_id: schoolId, canal, dias, assunto: canal === 'email' ? assunto.trim() : null, texto: texto.trim(),
    }, { onConflict: 'school_id,canal,dias' });
    if (error) setErro('Não foi possível salvar o texto.'); else { setAviso('Texto salvo.'); onSaved(); }
    setOcupado(false);
  };
  const restaurar = async () => {
    setOcupado(true);
    const { error } = await supabase.from('billing_message_templates').delete().eq('school_id', schoolId).eq('canal', canal).eq('dias', dias);
    if (error) setErro('Não foi possível restaurar.'); else { setAviso('Texto padrão restaurado.'); onSaved(); }
    setOcupado(false);
  };
  const testar = async () => {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await chamarFuncaoFinanceira('test-billing-message', { canal, dias, assunto, texto });
      if (r.success) setAviso('Teste enviado para você.'); else setErro(r.aviso || 'O teste não foi entregue.');
    } catch (e) { setErro(e.message); }
    setOcupado(false);
  };

  return (
    <div className="space-y-3">
      <Field label="Passo e canal" id="modelo-passo">
        <select id="modelo-passo" value={escolha} onChange={e => setEscolha(e.target.value)} className={inputCls}>
          {opcoes.map(o => <option key={`${o.canal}:${o.dias}`} value={`${o.canal}:${o.dias}`}>{rotuloDoPasso(o.dias)} · {CANAIS[o.canal]}</option>)}
        </select>
      </Field>
      {canal === 'email' && (
        <Field label="Assunto" id="modelo-assunto"><input id="modelo-assunto" type="text" maxLength={120} value={assunto} onChange={e => setAssunto(e.target.value)} className={inputCls} /></Field>
      )}
      <Field label="Texto" id="modelo-texto" hint={`Variáveis: ${VARIAVEIS.map(v => `{${v}}`).join(' ')}`}>
        <textarea id="modelo-texto" rows={5} maxLength={800} value={texto} onChange={e => setTexto(e.target.value)} className={inputCls} />
      </Field>
      {desconhecidas.length > 0 && <Notice type="error">Variável desconhecida: {desconhecidas.join(' ')}. Ela iria literal na mensagem.</Notice>}
      <div className="bg-surface-container border border-outline-variant rounded-zela-lg p-4 text-sm space-y-1">
        <p className="text-xs text-on-surface-variant">Prévia</p>
        {canal === 'email' && <p className="font-semibold">{preencher(assunto)}</p>}
        <p className="whitespace-pre-wrap">{preencher(texto)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={salvar} disabled={ocupado || !texto.trim() || desconhecidas.length > 0}>Salvar texto</PrimaryButton>
        <SecondaryButton onClick={testar} disabled={ocupado || !texto.trim()}>Enviar teste para mim</SecondaryButton>
        {salvo && <SecondaryButton onClick={restaurar} disabled={ocupado}>Restaurar padrão</SecondaryButton>}
      </div>
    </div>
  );
}

// WhatsApp pelas notificações nativas do Asaas (D12, opção a). O Asaas envia e cobra na conta da escola.
function CartaoWhatsApp({ setErro, setAviso }) {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const chamar = useCallback(async (acao) => {
    const r = await chamarFuncaoFinanceira('sync-asaas-whatsapp', { acao });
    if (acao === 'estado') return r;
    // Sincroniza em lotes até acabar (a função faz até 40 clientes por chamada).
    let atual = r; let rodadas = 0;
    while (atual.pendentes > 0 && rodadas < 25) { atual = await chamarFuncaoFinanceira('sync-asaas-whatsapp', { acao: 'sincronizar' }); rodadas++; }
    return atual;
  }, []);

  useEffect(() => { chamar('estado').then(setEstado).catch(() => setEstado({ erro: true })); }, [chamar]);

  const executa = async (acao, ok) => {
    setErro(''); setAviso(''); setOcupado(true);
    try { await chamar(acao); setEstado(await chamar('estado')); setAviso(ok); }
    catch (e) { setErro(e.message || 'Não foi possível falar com o Asaas.'); }
    setOcupado(false);
  };

  if (!estado) return null;
  if (estado.erro) return null;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-on-surface">WhatsApp pelo Asaas {estado.ligado ? '(ligado)' : '(desligado)'}</p>
          <p className="text-xs text-on-surface-variant">
            Liga o WhatsApp nas notificações de cobrança criada, véspera e atraso do Asaas, para o celular do responsável financeiro.
            O texto e os dias seguem o padrão do Asaas, não os passos acima, e cada mensagem é cobrada pelo Asaas na conta da escola.
          </p>
        </div>
        <div className="flex gap-2">
          {estado.ligado && <SecondaryButton onClick={() => executa('sincronizar', 'Sincronização concluída.')} disabled={ocupado}>Sincronizar agora</SecondaryButton>}
          <PrimaryButton onClick={() => executa(estado.ligado ? 'desativar' : 'ativar', estado.ligado ? 'WhatsApp desligado no Asaas.' : 'WhatsApp ligado no Asaas.')} disabled={ocupado}>
            {ocupado ? 'Aguarde' : estado.ligado ? 'Desligar' : 'Ligar WhatsApp'}
          </PrimaryButton>
        </div>
      </div>
      {estado.ligado && (
        <p className="text-xs text-on-surface-variant">
          {estado.aplicados} cliente(s) com WhatsApp ligado{estado.com_erro > 0 ? `, ${estado.com_erro} com aviso (celular inválido ou erro do Asaas; confira o telefone do responsável)` : ''}.
          Só celular com DDD recebe. Quem desligar o WhatsApp em Configurações deixa de receber.
        </p>
      )}
    </div>
  );
}
