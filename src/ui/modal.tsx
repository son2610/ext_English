import { useEffect, useRef, type ReactNode } from 'react';
import './library.css';

export function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`library-modal ${wide ? 'wide' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header className="modal-heading"><h2>{title}</h2><button autoFocus className="modal-close" onClick={close} aria-label="Đóng chi tiết">×</button></header>
    {children}
  </dialog>;
}
