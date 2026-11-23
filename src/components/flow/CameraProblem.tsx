"use client";

import { ArrowLeft, Browser, CameraSlash, Copy, LinkBreak, WifiSlash, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { M } from "@/config/messages";
import type { FlowState } from "./flow";
import { Button } from "../ui/Button";

const ICON: Record<string, Icon> = {
  denied: CameraSlash,
  "in-app": Browser,
  "no-camera": CameraSlash,
  insecure: LinkBreak,
  model: WifiSlash,
  unknown: WarningCircle,
};

export function CameraProblem({
  kind,
  onRetry,
  onBack,
}: {
  kind: NonNullable<FlowState["problem"]>;
  onRetry: () => void;
  onBack: () => void;
}) {
  const copy = M.camera.problems[kind];
  const [copied, setCopied] = useState(false);
  const KindIcon = ICON[kind] ?? WarningCircle;

  return (
    <div className="flex min-h-dvh flex-col bg-strip px-5 pt-[max(48px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex-1">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[#f6dfe2] text-stamp">
          <KindIcon size={32} weight="duotone" aria-hidden />
        </span>
        <h1 className="type-display mt-6 text-[30px]">{copy.title}</h1>
        <p className="mt-4 max-w-[36ch] text-[17px] leading-[1.55] text-ink-soft">{copy.body}</p>
        {kind === "in-app" && (
          <Button
            variant="secondary"
            className="mt-6"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={18} weight="bold" aria-hidden />
            {copied ? M.camera.copied : M.camera.copyLink}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onRetry}>
          {M.camera.retry}
        </Button>
        <Button variant="quiet" onClick={onBack}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {M.camera.back}
        </Button>
      </div>
    </div>
  );
}
