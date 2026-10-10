import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
  href?: string;
}

const ToastContext = createContext<{ push: (t: Omit<ToastItem, "id">) => void }>({ push: () => {} });

const TONE: Record<Tone, string> = {
  info: "border-l-brand",
  success: "border-l-pos",
  error: "border-l-neg",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => setItems((all) => [...all.slice(-3), { ...t, id: nextId++ }]), []);

  return (
    <ToastContext.Provider value={{ push }}>
      <RadixToast.Provider swipeDirection="right" duration={6000}>
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            onOpenChange={(open) => !open && setItems((all) => all.filter((x) => x.id !== t.id))}
            className={`rounded-card border border-white/15 border-l-4 ${TONE[t.tone]} p-4 shadow-lg shadow-black/30 backdrop-blur-xl backdrop-saturate-150`}
            style={{ background: "color-mix(in srgb, var(--surface-raised) 55%, transparent)" }}
          >
            <RadixToast.Title className="text-body font-medium text-ink">{t.title}</RadixToast.Title>
            {t.description && (
              <RadixToast.Description className="mt-1 text-small text-ink-2">{t.description}</RadixToast.Description>
            )}
            {t.href && (
              <a href={t.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-small text-brand hover:underline">
                View transaction ↗
              </a>
            )}
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
