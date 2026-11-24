import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Error inesperado en la aplicación.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturó un error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F6F4] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-xl p-8">
            <div className="text-xs font-medium text-[#E52421] mb-2">Bonus Ticket · Recuperación</div>
            <h1 className="text-xl font-bold text-[#101014] mb-2">
              Ocurrió un inconveniente al cargar el módulo
            </h1>
            <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
              Podés recargar el panel sin perder tus datos guardados localmente. Si estabas
              sincronizando con Firebase, verificá tu sesión de Google y los permisos del proyecto.
            </p>
            <pre className="text-xs font-mono bg-[#F8F6F4] border border-neutral-200 rounded-lg p-3 overflow-auto max-h-36 text-neutral-700 mb-6">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-medium rounded-lg transition-colors"
            >
              Recargar sistema
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
