import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/15" />
        {/* Frosted glass: the page shows through, softened. */}
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-40 max-h-[90vh] w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal border border-white/15 p-6 backdrop-blur-xl backdrop-saturate-150"
          style={{
            background:
              "linear-gradient(165deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.02) 40%, transparent 70%), color-mix(in srgb, var(--surface) 30%, transparent)",
            boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.12), 0 25px 50px -12px rgb(0 0 0 / 0.45)",
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-h4 font-medium text-ink">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-small text-ink-3">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-input px-2 py-1 text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
              ✕
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
