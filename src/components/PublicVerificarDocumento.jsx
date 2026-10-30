import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { inputCls, labelCls } from '../lib/matriculaFields';
import { codigoValido, formatarCodigo, normalizarCodigo, dataBR } from '../lib/documentosEscolares';

// Verificação pública de histórico escolar e declarações (item 12). Rota /verificar/<codigo>
// (o código também pode ser digitado). Mostra só escola, tipo, data e se o documento é válido
// ou foi cancelado, vindo da Edge Function verify-document. Nunca mostra dado do aluno.
const codigoDaUrl = () => {
  try { return normalizarCodigo(window.location.pathname.split('/')[2] || ''); } catch { return ''; }
};

export default function PublicVerificarDocumento() {
  const [codigo, setCodigo] = useState(codigoDaUrl());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  const verificar = async (valor) => {
    setErro('');
    setResultado(null);
    if (!codigoValido(valor)) return setErro('O código tem 16 letras e números. Confira o que está impresso no documento.');
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-document', { body: { codigo: normalizarCodigo(valor) } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResultado(data);
    } catch {
      setErro('Não foi possível verificar agora. Tente novamente em alguns minutos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (codigoValido(codigo)) verificar(codigo);
    // Só na abertura da página, para o link do documento já mostrar o resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-primary text-white px-4 py-8 sm:py-10">
        <div className="max-w-2xl mx-auto flex items-start gap-3">
          <ShieldCheck size={28} className="shrink-0 mt-1" />
          <div>
            <h1 className="text-h1">Verificar documento escolar</h1>
            <p className="text-sm opacity-90 mt-1">Digite o código impresso no histórico ou na declaração para conferir se ele é autêntico.</p>
          </div>
        </div>
      </div>

      <div className="w-full flex justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl flex flex-col gap-3 -mt-4 sm:-mt-6">
          <form
            onSubmit={(e) => { e.preventDefault(); verificar(codigo); }}
            className="bg-white border border-outline-variant rounded-lg p-4 sm:p-5 space-y-3"
          >
            <div>
              <label htmlFor="vd-codigo" className={labelCls}>Código de verificação</label>
              <input
                id="vd-codigo" className={`${inputCls} font-mono tracking-wider`} maxLength={24} autoComplete="off"
                value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="0000 0000 0000 0000"
              />
            </div>
            <button type="submit" disabled={carregando} className="px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
              {carregando && <Loader2 size={16} className="animate-spin" />} Verificar
            </button>
          </form>

          {erro && <div className="bg-error/5 border border-error/30 text-error p-3 rounded-md text-sm font-medium" role="alert">{erro}</div>}

          {resultado && !resultado.encontrado && (
            <div className="bg-white border border-outline-variant rounded-lg p-5 flex items-start gap-3" role="status">
              <XCircle className="text-error shrink-0" size={28} />
              <div>
                <h2 className="text-h2 text-on-surface">Documento não encontrado</h2>
                <p className="text-body text-on-surface-variant">Nenhum documento tem este código. Confira os caracteres ou fale com a escola.</p>
              </div>
            </div>
          )}

          {resultado?.encontrado && (
            <div className="bg-white border border-outline-variant rounded-lg p-5 flex items-start gap-3" role="status">
              {resultado.situacao === 'valido'
                ? <CheckCircle2 className="text-success shrink-0" size={28} />
                : <XCircle className="text-error shrink-0" size={28} />}
              <div className="space-y-1">
                <h2 className="text-h2 text-on-surface">{resultado.situacao === 'valido' ? 'Documento válido' : 'Documento cancelado'}</h2>
                <p className="text-body text-on-surface-variant">{resultado.tipo}</p>
                <p className="text-body text-on-surface-variant">Escola: {resultado.escola}</p>
                <p className="text-body text-on-surface-variant">Emitido em {dataBR(String(resultado.emitido_em).slice(0, 10))}</p>
                <p className="text-xs text-on-surface-variant">Código {formatarCodigo(codigo)}</p>
                {resultado.situacao !== 'valido' && <p className="text-sm text-error font-medium">Este documento foi cancelado pela escola e não vale mais.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
