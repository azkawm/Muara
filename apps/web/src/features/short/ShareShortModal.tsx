import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import HoloCard from "../../components/holo/HoloCard";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { Button, Skeleton } from "../../components/ui";
import { dataUrlToFile, renderPositionCard } from "./positionCard";
import { useShortSummary } from "./ShortPosition";

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Holographic card of the open short, with native share, download and copy. */
export function ShareShortModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { address } = useAccount();
  const s = useShortSummary();
  const toast = useToast();
  const [image, setImage] = useState<string>();

  // Render once per open; the foil shimmers live, the numbers are a snapshot.
  useEffect(() => {
    if (!open || !s || !address) return;
    let cancelled = false;
    setImage(undefined);
    renderPositionCard({
      symbol: "NVDA",
      size: s.debt,
      entry: s.entry,
      mark: s.price,
      pnl: s.pnl,
      healthFactor: s.healthFactor,
      liqPrice: s.liqPrice,
      address,
      liquidated: s.liquidated,
      liquidatedSize: s.size - s.debt,
    })
      .then((url) => {
        if (!cancelled) setImage(url);
      })
      .catch((err: unknown) => {
        console.error("position card render failed", err);
        if (!cancelled) toast.push({ title: "Could not draw the card", description: String(err), tone: "error" });
      });
    return () => {
      cancelled = true;
    };
    // Re-render when the dialog opens or the position first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, address, !!s]);

  const text = !s
    ? ""
    : s.liquidated
      ? `Got liquidated shorting ${(s.size - s.debt).toFixed(2)} NVDA on Muara at ${usd(s.entry)}. Nice try. Don't be greedy.`
      : `Short ${s.debt.toFixed(2)} NVDA on Muara at ${usd(s.entry)} · ${s.pnl >= 0 ? "+" : "−"}${usd(s.pnl)} unrealized. Every chain flows to one registry.`;

  const share = async () => {
    if (!image) return;
    const file = dataUrlToFile(image, "muara-short-nvda.png");
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "My Muara short", text });
        return;
      } catch {
        // User cancelled, or the share sheet refused; fall through to download.
      }
    }
    download();
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ title: "Card downloaded, caption copied", description: "Paste the caption with the image.", tone: "success" });
    } catch {
      toast.push({ title: "Card downloaded", tone: "success" });
    }
  };

  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = "muara-short-nvda.png";
    a.click();
  };

  const tweet = () => {
    const url = new URL("https://x.com/intent/post");
    url.searchParams.set("text", text);
    window.open(url.toString(), "_blank", "noopener");
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={s?.liquidated ? "Share the lesson" : "Share your short"}
      description="Share it with the image, or copy a caption."
    >
      <div className="flex flex-col items-center gap-5">
        {image ? (
          <HoloCard image={image} alt="Muara short position card" preset="rainbow" intensity={0} edgeSparkle={0} glare={0.3} width={300} radius={18} frame={0} />
        ) : (
          <Skeleton className="h-[417px] w-[300px] rounded-[18px]" />
        )}
        <div className="grid w-full grid-cols-3 gap-2">
          <Button variant="glass" disabled={!image} onClick={share}>
            Share
          </Button>
          <Button variant="secondary" disabled={!image} onClick={download}>
            Download
          </Button>
          <Button variant="secondary" disabled={!image} onClick={tweet}>
            Post on X
          </Button>
        </div>
      </div>
    </Modal>
  );
}
