import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPersonName } from '../utils/formatName';
import { inputCls, labelCls } from '../lib/matriculaFields';

// Formulário público "Quero conhecer a escola" (item 11, Captação). Rota
// /quero-conhecer?codigo=XXXX, link que a escola divulga (Instagram, WhatsApp, QR Code).
// Não grava direto: tudo passa pela Edge Function public-lead-request, que valida,
// limita por IP e exige o consentimento. `origem` opcional na URL (instagram, google,
// indicacao) só marca de onde veio o interessado; qualquer outro valor vira "site".
const params = () => {
  try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
};

export default function PublicLead() {
  const codigo = (params().get('codigo') || '').trim().toUpperCase();
  const origem = params().get('origem') || 'site';
  const [f, setF] = useState({ responsavel_nome: '', telefone: '', email: '', crianca_nome: '', crianca_nascimento: '', interesse: '' });
  const [consentimento, setConsentimento] = useState(false);
  const [isca, setIsca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!codigo) return setErro('Este link está incompleto. Peça o link atualizado à escola.');
    if (!f.responsavel_nome.trim()) return setErro('Informe o seu nome.');
    if (!f.telefone.trim() && !f.email.trim()) return setErro('Informe um telefone ou um e-mail para a escola falar com você.');
    if (!consentimento) return setErro('Marque a autorização para a escola entrar em contato.');

    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-lead-request', {
        body: {
          school_code: codigo,
          origem,
          responsavel_nome: formatPersonName(f.responsavel_nome),
          telefone: f.telefone,
          email: f.email,
          crianca_nome: f.crianca_nome ? formatPersonName(f.crianca_nome) : '',
          crianca_nascimento: f.crianca_nascimento,
          interesse: f.interesse,
          consentimento: true,
          website: isca,
        },
      });
      if (error || !data || data.error) {
        let msg = data?.error;
        if (!msg && error?.context && typeof error.context.json === 'function') {
          try { msg = (await error.context.json())?.error; } catch { /* corpo não era JSON */ }
        }
        throw new Error(msg || 'Não foi possível enviar agora.');
      }
      setFeito(true);
    } catch (err) {
      setErro(err.message || 'Não foi possível enviar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-surface-container-lowest">
      <div className="bg-ink px-5 sm:px-8 py-8 sm:py-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-primary rounded-md flex items-center justify-center shrink-0">
              <ShieldCheck className="text-white" size={18} />
            </div>
            <span className="font-serif text-lg font-bold text-white">Zela Edu</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white mb-1.5">Quero conhecer a escola</h1>
          <p className="text-sm text-ink-text leading-relaxed max-w-xl">
            Deixe seus dados e a escola entra em contato para tirar dúvidas e combinar uma visita.
          </p>
        </div>
      </div>

      <div className="w-full flex justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl flex flex-col -mt-4 sm:-mt-6">
          {feito ? (
            <div className="bg-white border border-outline-variant rounded-lg p-8 text-center flex flex-col items-center gap-4">
              <CheckCircle2 className="text-success" size={48} />
              <div>
                <h2 className="text-h2 text-on-surface mb-2">Recebemos o seu pedido</h2>
                <p className="text-body text-on-surface-variant">A escola vai entrar em contato em breve. Obrigada pelo interesse.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-3">
              {erro && <div className="bg-error/5 border border-error/30 text-error p-3 rounded-md text-sm font-medium" role="alert">{erro}</div>}

              <section className="bg-white border border-outline-variant rounded-lg p-4 sm:p-5 space-y-3">
                <h2 className="font-bold text-on-surface text-sm">Seus dados</h2>
                <div>
                  <label htmlFor="pl-nome" className={labelCls}>Nome completo *</label>
                  <input id="pl-nome" className={inputCls} maxLength={120} autoComplete="name" value={f.responsavel_nome} onChange={set('responsavel_nome')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pl-tel" className={labelCls}>Telefone ou WhatsApp</label>
                    <input id="pl-tel" className={inputCls} type="tel" inputMode="tel" maxLength={30} autoComplete="tel" value={f.telefone} onChange={set('telefone')} />
                  </div>
                  <div>
                    <label htmlFor="pl-email" className={labelCls}>E-mail</label>
                    <input id="pl-email" className={inputCls} type="email" maxLength={160} autoComplete="email" value={f.email} onChange={set('email')} />
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant">Informe ao menos um dos dois.</p>
              </section>

              <section className="bg-white border border-outline-variant rounded-lg p-4 sm:p-5 space-y-3">
                <h2 className="font-bold text-on-surface text-sm">Sobre a criança (opcional)</h2>
                <div>
                  <label htmlFor="pl-crianca" className={labelCls}>Nome da criança</label>
                  <input id="pl-crianca" className={inputCls} maxLength={120} value={f.crianca_nome} onChange={set('crianca_nome')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pl-nasc" className={labelCls}>Data de nascimento</label>
                    <input id="pl-nasc" className={inputCls} type="date" max={new Date().toISOString().slice(0, 10)} value={f.crianca_nascimento} onChange={set('crianca_nascimento')} />
                  </div>
                  <div>
                    <label htmlFor="pl-interesse" className={labelCls}>Turma ou ano de interesse</label>
                    <input id="pl-interesse" className={inputCls} maxLength={120} placeholder="Ex.: Infantil 2, para o próximo ano" value={f.interesse} onChange={set('interesse')} />
                  </div>
                </div>
              </section>

              {/* Isca contra robôs: fora da tela e do teclado. Pessoa nunca preenche. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>Site<input tabIndex={-1} autoComplete="off" value={isca} onChange={e => setIsca(e.target.value)} /></label>
              </div>

              <section className="bg-white border border-outline-variant rounded-lg p-4 sm:p-5 space-y-3">
                <label className="flex items-start gap-2.5 text-sm text-on-surface cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={consentimento} onChange={e => setConsentimento(e.target.checked)} />
                  <span>
                    Autorizo a escola a usar estes dados para entrar em contato comigo sobre matrícula e visita.
                    Eles não são compartilhados e podem ser apagados a pedido meu.
                  </span>
                </label>
              </section>

              <button type="submit" disabled={enviando} className="w-full bg-primary text-white font-semibold rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                {enviando && <Loader2 size={16} className="animate-spin" />} Enviar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
