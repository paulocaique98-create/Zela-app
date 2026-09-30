import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { buscarCep, cepCompleto, formatarCep, somenteDigitosCep } from '../lib/cep';

const MENSAGENS = {
  buscando: 'Buscando endereço…',
  ok: 'Endereço encontrado. Complete o número.',
  nao_encontrado: 'CEP não encontrado. Preencha o endereço à mão.',
  indisponivel: 'Busca de CEP indisponível agora. Preencha o endereço à mão.',
};

// Campo de CEP que vem primeiro em todo formulário de endereço: com os 8
// números, busca rua, bairro, cidade e UF (src/lib/cep.js) e entrega em
// onEncontrado; o foco vai para o campo `focarDepois` (o número).
export default function CampoCep({ id, value, onChange, onEncontrado, focarDepois, className, classeMensagem = 'text-on-surface-variant', required = false, placeholder = '00000-000' }) {
  const [estado, setEstado] = useState(null);
  const ultimoBuscado = useRef(somenteDigitosCep(value));

  const mudar = async (bruto) => {
    const formatado = formatarCep(bruto);
    onChange(formatado);
    const digitos = somenteDigitosCep(formatado);
    if (!cepCompleto(digitos)) {
      setEstado(null);
      ultimoBuscado.current = '';
      return;
    }
    if (digitos === ultimoBuscado.current) return;
    ultimoBuscado.current = digitos;
    setEstado('buscando');
    const resultado = await buscarCep(digitos);
    if (ultimoBuscado.current !== digitos) return; // a pessoa já mudou o CEP
    setEstado(resultado.status);
    if (resultado.status === 'ok') {
      onEncontrado?.(resultado.endereco);
      if (focarDepois) setTimeout(() => document.getElementById(focarDepois)?.focus(), 0);
    }
  };

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          required={required}
          placeholder={placeholder}
          value={value || ''}
          onChange={e => mudar(e.target.value)}
          className={className}
        />
        {estado === 'buscando' && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin opacity-60" />}
      </div>
      {estado && estado !== 'buscando' && (
        <p className={`text-[11px] mt-1 ${estado === 'ok' ? classeMensagem : 'text-amber-600'}`}>{MENSAGENS[estado]}</p>
      )}
    </div>
  );
}
