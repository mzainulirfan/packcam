import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Pakti runtime error', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-950">
          <div className="grid w-full max-w-xl gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Runtime error</p>
            <h1 className="text-2xl font-semibold tracking-tight">Aplikasi gagal dimuat</h1>
            <p className="text-sm leading-6 text-slate-600">
              Ada error saat render aplikasi. Ini biasanya disebabkan oleh data runtime yang tidak valid atau
              kegagalan browser API.
            </p>
            <pre className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
