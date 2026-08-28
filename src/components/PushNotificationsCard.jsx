import React from 'react';
import { Bell, BellOff, BellRing, Check, Smartphone, AlertTriangle } from 'lucide-react';

// Card de Notificações Push — consome o `pushData` de usePushNotifications
// (mesmo hook usado no Portal da Família) e traduz o `status` derivado em
// uma UI compreensível. Compartilhado entre FamilySettings.jsx e
// AdminSettings.jsx pra não duplicar essa lógica de estados em cada tela.
export default function PushNotificationsCard({ pushData }) {
  if (!pushData) return null;
  const { status, isLoading, subscribe, unsubscribe, error } = pushData;

  return (
    <div className="bg-white p-5 rounded-zela-xl shadow-sm border border-outline-variant">
      <h3 className="font-bold text-base text-on-surface flex items-center gap-2 mb-4">
        <Bell className="text-primary" size={18} /> Notificações Push
      </h3>
      <div className="space-y-2">
        {status === 'ios-install-required' && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-zela-md">
            <Smartphone className="text-blue-500 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="text-sm font-bold text-blue-800">Ative pelo app instalado</p>
              <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                No iPhone/iPad, notificações só funcionam com o Zela adicionado à Tela de Início:
                abra este site no <strong>Safari</strong>, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>,
                depois abra o Zela pelo novo ícone e volte aqui pra ativar.
              </p>
            </div>
          </div>
        )}

        {status === 'unsupported' && (
          <div className="flex items-start gap-3 p-4 bg-surface-container-low border border-outline-variant rounded-zela-md">
            <AlertTriangle className="text-on-surface-variant/70 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="text-sm font-bold text-on-surface">Não disponível neste navegador</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{error || 'Tente abrir o Zela pelo Chrome (Android) ou Safari (iPhone/iPad).'}</p>
            </div>
          </div>
        )}

        {status === 'permission-denied' && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-zela-md">
            <BellOff className="text-red-500 shrink-0" size={24} />
            <div>
              <p className="text-sm font-bold text-red-800">Notificações bloqueadas</p>
              <p className="text-xs text-red-600 mt-0.5">Habilite nas configurações do seu navegador para receber avisos.</p>
            </div>
          </div>
        )}

        {(status === 'permission-default' || status === 'available' || status === 'subscribing' || status === 'error') && (
          <div className="flex flex-col gap-3 p-4 bg-surface-container-low border border-outline-variant rounded-zela-md">
            <div className="flex items-center gap-3">
              <Bell className="text-on-surface-variant/70 shrink-0" size={24} />
              <div>
                <p className="text-sm font-bold text-on-surface">Ativar notificações</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Receba alertas importantes mesmo com o Zela fechado.</p>
              </div>
            </div>
            {status === 'error' && error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}
            <button
              type="button"
              onClick={subscribe}
              disabled={isLoading}
              className="w-full bg-primary text-white font-bold py-2.5 rounded-lg hover:bg-primary-container transition text-sm disabled:opacity-70"
            >
              {isLoading ? 'Ativando...' : 'Ativar notificações'}
            </button>
          </div>
        )}

        {status === 'subscribed' && (
          <div className="flex flex-col gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-zela-md">
            <div className="flex items-center gap-3">
              <BellRing className="text-emerald-500 shrink-0" size={24} />
              <div>
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-1"><Check size={14} /> Ativas</p>
                <p className="text-xs text-emerald-600 mt-0.5">Neste dispositivo.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={isLoading}
              className="w-full border border-emerald-200 text-emerald-700 font-bold py-2.5 rounded-lg hover:bg-emerald-100 transition text-sm disabled:opacity-70"
            >
              {isLoading ? 'Desativando...' : 'Desativar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
