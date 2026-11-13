"use client";

import { useEffect, useMemo, useRef } from "react";
import { denScene } from "@/components/landing/art/den/scene.ts";
import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";
import type { IScene } from "@/components/landing/art/dither/scene.ts";

export function HeroDen() {
  const reaction = useRef({ active: false, changed: 0, breath: 0 });

  useEffect(() => {
    const cta = document.querySelector("#hero .den-button");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");

    const start = () => {
      if (fine.matches) {
        reaction.current.active = true;
        reaction.current.changed = performance.now() / 1000;
      }
    };

    const stop = () => {
      reaction.current.active = false;
    };

    cta?.addEventListener("mouseenter", start);
    cta?.addEventListener("focus", start);
    cta?.addEventListener("mouseleave", stop);
    cta?.addEventListener("blur", stop);

    return () => {
      cta?.removeEventListener("mouseenter", start);
      cta?.removeEventListener("focus", start);
      cta?.removeEventListener("mouseleave", stop);
      cta?.removeEventListener("blur", stop);
    };
  }, [reaction]);

  const scene = useMemo<IScene>(
    () => ({
      moving: denScene.moving,
      shade: (frame) => {
        reaction.current.breath +=
          ((reaction.current.active ? 1 : 0) - reaction.current.breath) * 0.5;

        return denScene.shade({
          ...frame,
          excitement: reaction.current.breath,
          packetSeconds:
            reaction.current.active && frame.seconds - reaction.current.changed < 4.5
              ? frame.seconds - reaction.current.changed
              : frame.seconds,
        });
      },
    }),
    [reaction],
  );

  return <DitherCanvas scene={scene} className="absolute inset-0" />;
}
