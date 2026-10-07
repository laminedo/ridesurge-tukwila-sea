'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet on a native `<dialog>`: focus trap, Escape and backdrop come from the platform. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[19px] font-semibold leading-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 truncate text-[13px] text-fg-3">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 active:bg-raised"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="no-scrollbar overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}
