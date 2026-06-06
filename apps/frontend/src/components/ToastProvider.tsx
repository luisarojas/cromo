'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'error' | 'success' | 'info';

interface ToastAction {
  // Label rendered inline in the toast. Keep it short — "Undo", "Retry".
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastOptions {
  type?: ToastType;
  action?: ToastAction;
  // Override default 4s. Useful when an action is present and we want to give
  // the user more time to hit Undo before the snackbar disappears.
  durationMs?: number;
}

interface ToastContextValue {
  // Back-compat surface — existing call sites use addToast(message) or addToast(message, type).
  addToast: (message: string, typeOrOptions?: ToastType | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const BG: Record<ToastType, string> = {
  error:   'bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)]',
  success: 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]',
  info:    'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, typeOrOptions?: ToastType | ToastOptions) => {
      const options: ToastOptions = typeof typeOrOptions === 'string'
        ? { type: typeOrOptions }
        : (typeOrOptions ?? {});
      const id = crypto.randomUUID();
      const type = options.type ?? 'error';
      setToasts((prev) => [...prev, { id, message, type, action: options.action }]);
      // Toasts with actions linger longer so the user has time to react.
      const duration = options.durationMs ?? (options.action ? 7000 : 4000);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Bottom-anchored snackbar stack on mobile, bottom-right on desktop.
          Anchored via the shared --cromo-tabbar-h token (0 on desktop) plus
          a 1rem gap so toasts don't sit flush against the tab bar. */}
      <div
        className="fixed left-2 right-2 md:left-auto md:right-4 z-50 flex flex-col gap-2 items-stretch md:items-end pointer-events-none"
        style={{
          bottom: 'calc(var(--cromo-tabbar-h) + 1rem)',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg text-sm shadow-cromo-lg md:max-w-sm animate-in ${BG[toast.type]}`}
            role="status"
          >
            <span className="flex-1 min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
                className="shrink-0 underline underline-offset-2 font-semibold opacity-95 hover:opacity-100"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-75 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
