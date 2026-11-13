import { useState } from 'react';
import { lerConfig, salvarConfig } from '../lib/energiaDoTotem';

// Configuração de energia do aparelho (repouso + horário de atendimento).
// Vive no menu da engrenagem do Autoatendimento; vale só para este aparelho
// (localStorage — ver lib/energiaDoTotem.js). O leitor facial e o menu leem
// a config ao abrir/a cada checagem, então a mudança vale na hora.
export default function EnergiaDoTotemModal({ onClose }) {
  const [rascunho, setRascunho] = useState(() => lerConfig());

  return (
    <div className="fixed inset-0 z-[1002] bg-ink/70 flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-zela-lg p-5 w-full max-w-sm space-y-4 text-on-surface">
        <h3 className="font-bold">Energia deste aparelho</h3>
        <label className="block text-sm">
          Repouso (tela preta) após quantos minutos sem ninguém? (0 = nunca)
          <input type="number" min="0" max="120" value={rascunho.repousoMin}
            onChange={e => setRascunho(c => ({ ...c, repousoMin: e.target.value }))}
            className="mt-1 w-full border border-outline-variant rounded-zela-md px-3 py-2 bg-surface" />
        </label>
        <div className="text-sm">
          Horário de atendimento (câmera desligada fora dele; vazio = sempre ligada)
          <div className="flex gap-2 mt-1">
            <input type="time" value={rascunho.horarioInicio} aria-label="Início do atendimento"
              onChange={e => setRascunho(c => ({ ...c, horarioInicio: e.target.value }))}
              className="flex-1 border border-outline-variant rounded-zela-md px-3 py-2 bg-surface" />
            <input type="time" value={rascunho.horarioFim} aria-label="Fim do atendimento"
              onChange={e => setRascunho(c => ({ ...c, horarioFim: e.target.value }))}
              className="flex-1 border border-outline-variant rounded-zela-md px-3 py-2 bg-surface" />
          </div>
        </div>
        <p className="text-xs text-on-surface-variant">Vale só para este aparelho.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-zela-md bg-surface-container">Cancelar</button>
          <button
            onClick={() => { salvarConfig(rascunho); onClose(); }}
            className="px-4 py-2 text-sm font-bold rounded-zela-md bg-primary text-white"
          >Salvar</button>
        </div>
      </div>
    </div>
  );
}
