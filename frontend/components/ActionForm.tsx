"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/types";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  // Hidden inputs sent with the form (ids, etc.).
  fields: Record<string, string>;
  children: ReactNode;
  className?: string;
  pendingLabel?: ReactNode;
  // Asks "are you sure?" before sending.
  confirm?: string;
};

// A one-button form for actions like follow, block, delete. Shows a loading state and any error
// instead of failing silently.
export function ActionForm({ action, fields, children, className, pendingLabel, confirm }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={className}
        disabled={pending}
        onClick={(event) => {
          if (confirm && !window.confirm(confirm)) event.preventDefault();
        }}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
