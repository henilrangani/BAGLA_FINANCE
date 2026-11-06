/**
 * One consistent way to leave any overlay.
 *
 * - role="dialog" + aria-modal, labelled by the panel's heading.
 * - Escape, a click on the backdrop, the browser Back button and every close/cancel button all go
 *   through `requestClose`. If the form has unsaved changes (`dirty`), the user is asked first:
 *   Keep editing / Discard (and Save, when the form offers `onSave`). Nothing is ever submitted by closing.
 * - Focus moves into the dialog, Tab stays inside it, and focus returns to the opener on close.
 * - Background scrolling is locked while open.
 *
 * Usage (render prop, so the panel's own X / Cancel buttons use the same guarded close):
 *   <Modal onClose={() => setOpen(false)} dirty={changed} labelledBy="my-title">
 *     {close => <div className="panel">... <button onClick={close}>Cancel</button></div>}
 *   </Modal>
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

const stack: string[] = [];

// The element that opened a dialog. document.activeElement at mount time isn't reliable (a click may not
// focus, and StrictMode re-runs effects after focus has already moved into the dialog), so remember the
// last element the user pressed or focused outside any dialog.
let lastOutside: HTMLElement | null = null;
if (typeof document !== "undefined") {
  const note = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !(t instanceof HTMLElement) || t.closest('[role="dialog"]')) return;
    lastOutside = (t.closest('button, a, input, select, textarea, [tabindex]') as HTMLElement | null) || t;
  };
  document.addEventListener("pointerdown", note, true);
  document.addEventListener("focusin", note, true);
}
const isTop = (id: string) => stack[stack.length - 1] === id;
export const openModalCount = () => stack.length;

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  onClose: () => void;
  dirty?: boolean;
  /** Optional: offered as "Save" in the unsaved-changes prompt. Return false to stay open (e.g. invalid). */
  onSave?: () => boolean | void | Promise<boolean | void>;
  labelledBy?: string;
  label?: string;
  /** Classes for the full-screen backdrop/positioning layer. */
  className?: string;
  /** Backdrop clicks close (default true). */
  closeOnBackdrop?: boolean;
  children: (requestClose: () => void) => React.ReactNode;
}

export function Modal({ onClose, dirty = false, onSave, labelledBy, label, className, closeOnBackdrop = true, children }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const poppedRef = useRef(false);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) setConfirming(true);
    else closeRef.current();
  }, []);

  // Stack, history entry (browser Back closes the top dialog), scroll lock, focus restore.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const opener = active && active !== document.body && !active.closest('[role="dialog"]') ? active : lastOutside;
    stack.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    try { if (history.state?.baglaModal !== id) history.pushState({ ...(history.state || {}), baglaModal: id }, ""); } catch { /* sandboxed */ }

    const onPop = (e: PopStateEvent) => {
      // Landing on our own entry (a child dialog closed, or a StrictMode remount) is not a "Back" for us.
      if (e.state?.baglaModal === id || !isTop(id)) return;
      if (dirtyRef.current) {
        // Back must not lose typed data: restore our entry and ask.
        try { history.pushState({ ...(history.state || {}), baglaModal: id }, ""); } catch { /* ignore */ }
        setConfirming(true);
      } else {
        poppedRef.current = true;
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);

    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") || ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first || ref.current)?.focus();

    return () => {
      window.removeEventListener("popstate", onPop);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = prevOverflow;
      // Remove our history entry once we're really gone (a StrictMode remount re-adds `id` to the stack first).
      if (!poppedRef.current) {
        setTimeout(() => {
          if (!stack.includes(id) && history.state?.baglaModal === id) {
            try { history.back(); } catch { /* ignore */ }
          }
        }, 0);
      }
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [id]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isTop(id)) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      if (confirming) setConfirming(false);
      else requestClose();
      return;
    }
    if (e.key === "Tab" && ref.current) {
      const items = (Array.prototype.slice.call(ref.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(el => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  };

  const save = async () => {
    if (!onSave) return;
    const ok = await onSave();
    setConfirming(false);
    if (ok !== false) closeRef.current();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) requestClose(); }}
      className={className || "fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn"}
    >
      {children(requestClose)}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/40"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirming(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-discard`} aria-describedby={`${id}-discard-d`}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
            <h4 id={`${id}-discard`} className="font-black text-gray-950 dark:text-white">Discard unsaved changes?</h4>
            <p id={`${id}-discard-d`} className="text-sm text-gray-600 dark:text-slate-300">
              You've entered details that haven't been saved. Nothing has been recorded yet.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" autoFocus onClick={() => setConfirming(false)}
                className="px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-slate-600 text-sm font-bold text-gray-800 dark:text-slate-100 cursor-pointer">
                Keep editing
              </button>
              {onSave && (
                <button type="button" onClick={save}
                  className="px-4 py-2.5 rounded-2xl bg-[#047857] hover:bg-[#065f46] text-white text-sm font-bold cursor-pointer">
                  Save
                </button>
              )}
              <button type="button" onClick={() => { setConfirming(false); closeRef.current(); }}
                className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold cursor-pointer">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Standard X button for dialog headers (44px touch target, accessible name). */
export function CloseButton({ onClick, label = "Close", className = "" }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`w-11 h-11 -m-1.5 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 cursor-pointer shrink-0 ${className}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
