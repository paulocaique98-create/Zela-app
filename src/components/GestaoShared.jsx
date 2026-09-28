import React from 'react';
import { Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';

// Peças visuais compartilhadas pelas telas novas do Portal da Gestão.
// O título da tela já aparece no Header do app (SCREEN_LABELS), então aqui
// só entra a descrição curta e as ações.

export function PageShell({ description, actions, children }) {
  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      {(description || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-outline-variant shrink-0">
          {description ? <p className="text-small text-on-surface-variant">{description}</p> : <span />}
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', onClick }) {
  const tones = {
    default: 'text-on-surface',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`text-left bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 ${onClick ? 'hover:border-primary/40 hover:shadow-sm transition' : ''}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/80">{label}</p>
      <p className={`text-2xl font-black mt-1 tabular-nums ${tones[tone] || tones.default}`}>{value}</p>
      {hint && <p className="text-xs text-on-surface-variant/70 mt-0.5">{hint}</p>}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, text, hint }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
      {Icon && <Icon size={30} className="text-outline-variant mb-2" />}
      <p className="text-sm font-semibold text-on-surface-variant">{text}</p>
      {hint && <p className="text-xs text-on-surface-variant/70 mt-1 max-w-md">{hint}</p>}
    </div>
  );
}

export function Loading() {
  return <div className="flex items-center justify-center py-16 text-on-surface-variant"><Loader2 className="animate-spin" size={24} /></div>;
}

export function Notice({ type = 'error', children }) {
  if (!children) return null;
  const isError = type === 'error';
  return (
    <div className={`p-2.5 rounded-zela-md text-sm font-medium flex items-start gap-2 border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
      {isError ? <AlertCircle size={16} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={16} className="shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white rounded-zela-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
          <h3 className="font-bold text-on-surface">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container rounded-zela-md" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-outline-variant flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export const inputCls = 'w-full px-3 py-2 bg-white border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export function Field({ label, id, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant/70 mt-1">{hint}</p>}
    </div>
  );
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button {...props} className={`flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50 ${props.className || ''}`}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }) {
  return (
    <button {...props} className={`flex items-center gap-1.5 px-3.5 py-2 bg-surface-container-low hover:bg-primary/10 hover:text-primary border border-outline-variant text-on-surface-variant font-bold rounded-zela-md text-sm transition disabled:opacity-50 ${props.className || ''}`}>
      {children}
    </button>
  );
}

// Tabela que vira lista de cartões no celular (PLANO_APPS_MOBILE, Fase 7):
// no computador (md+) é a tabela de sempre; no celular cada linha vira um
// cartão, com o(s) campo(s) `primary` como título, os demais como
// "rótulo: valor" e o campo `actions` no rodapé. Nada de rolar para os lados.
// columns: [{ label, render: (row) => node, className?, align?: 'right',
//            primary?: true, actions?: true, hideOnMobile?: true }]
export function ResponsiveTable({ columns, rows, rowKey = (r) => r.id, rowClassName }) {
  const primary = columns.filter(c => c.primary);
  const details = columns.filter(c => !c.primary && !c.actions && !c.hideOnMobile);
  const actions = columns.filter(c => c.actions);
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
              {columns.map((c, i) => (
                <th key={i} className={`py-2 pr-3 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={rowKey(r, idx)} className={`border-b border-outline-variant/50 ${rowClassName ? rowClassName(r) : ''}`}>
                {columns.map((c, i) => (
                  <td key={i} className={`py-2 pr-3 ${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden space-y-2">
        {rows.map((r, idx) => {
          const renderedActions = actions.map(c => c.render(r)).filter(Boolean);
          return (
          <li key={rowKey(r, idx)} className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3 space-y-1.5 ${rowClassName ? rowClassName(r) : ''}`}>
            {primary.length > 0 && (
              <div className="text-sm font-bold text-on-surface">
                {primary.map((c, i) => <div key={i}>{c.render(r)}</div>)}
              </div>
            )}
            {details.map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-xs text-on-surface-variant shrink-0 pt-0.5">{c.label}</span>
                <span className="text-right text-on-surface min-w-0 break-words">{c.render(r)}</span>
              </div>
            ))}
            {renderedActions.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-outline-variant/50">
                {renderedActions.map((node, i) => <div key={i}>{node}</div>)}
              </div>
            )}
          </li>
          );
        })}
      </ul>
    </>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap px-3.5 py-2 rounded-zela-md text-xs font-bold transition shrink-0 ${active === t.id ? 'bg-primary text-white shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary'}`}
        >
          {t.label}{t.badge ? ` (${t.badge})` : ''}
        </button>
      ))}
    </div>
  );
}
