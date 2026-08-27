import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { logClientError, installGlobalErrorHandlers } from './lib/errorLogger'

installGlobalErrorHandlers()

// Error Boundary próprio (sem Sentry): troca a tela branca por uma mensagem
// amigável quando algum componente quebra o render, e registra o erro no
// Supabase (client_error_logs) via logClientError — visível pro developer
// em Painel do Dev > Logs.
class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    logClientError(error, { componentStack: info?.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: '24px', fontFamily: 'system-ui, sans-serif', gap: '12px',
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1e1b4b' }}>Algo deu errado</h1>
          <p style={{ color: '#64748b', maxWidth: '360px' }}>
            Encontramos um erro inesperado. Nossa equipe já foi avisada — tente recarregar a página.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px', padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
