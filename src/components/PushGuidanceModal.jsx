import { Bell, X, CheckCircle2 } from 'lucide-react';

// Mostrado logo depois que o usuário ativa as notificações push, com o
// passo a passo pra evitar que o celular bloqueie a entrega em segundo
// plano (causa raiz confirmada em produção: gerenciadores de bateria de
// fabricante, ex. "apps em hibernação" do Samsung, matam o push mesmo com a
// economia de bateria padrão do Android desligada).
export default function PushGuidanceModal({ guidance, onClose }) {
  if (!guidance) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-primary">
            <Bell size={22} />
            <h2 className="text-lg font-bold text-gray-900">{guidance.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Suas notificações foram ativadas. Alguns celulares bloqueiam avisos de apps fechados por padrão,
          então siga os passos abaixo pra garantir que você não perca nenhum aviso.
        </p>

        <ul className="space-y-3 mb-5">
          {guidance.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
              <span>{step}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          className="w-full bg-primary text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
