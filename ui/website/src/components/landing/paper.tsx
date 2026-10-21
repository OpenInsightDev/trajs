"use client";

/**
 * The page's paper: the haze the hero is drawn on, and the ground the page carries
 * on with below it.
 *
 * It is `Apricot haze`, the fill the design paints its boards with (`230:2`,
 * `224:194`, `225:4`, `225:186`), in both of the file's modes: the pigments are
 * that fill's cloud greys, as `Effect / Cloud` states them per mode, and every
 * other parameter is the one the boards are drawn from — so the light page is
 * the same painting in the light palette rather than a second drawing. The
 * canvas under it is `Surface / Canvas`, so a browser without WebGPU shows the
 * same ground the fill is mixed on.
 *
 * The fill is laid out in the box it fills: its centre is a percentage of that
 * box and its distances are read off the box's short side. A box as tall as the
 * document would therefore stretch the composition as the page grew, and carry
 * its centre down with it. The parameters are stated for a screen instead — the
 * box the file draws a board in — and rescaled to the box, so the first screen is
 * the board's composition and everything below it is that same painting carried
 * on, rather than a second, larger one.
 */

import { Haze, ShaderFill, type Shader } from "@trajs/ui-shaders";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "../../theme";
import { cloudPigments, type CloudPigments } from "./palette";

/** The field the boards are drawn from: centre at 50% and 58.4485%, radius
 * 71.5737%, turned -23.5995°. */
const field = { angle: -23.5995, radius: 71.5737, x: 50, y: 58.4485 };

/** The paper's box, and the screen height its painting is stated for. */
type Frame = Readonly<{ width: number; height: number; screen: number }>;

/**
 * The painting, mixed from one mode's clouds: the haze's coral is the cloud's
 * mid, its golden the high and its apricot the low, the way the boards' fill
 * carries them — on the field the boards are drawn from, rescaled from the screen
 * the parameters are stated for to the box the paper actually fills.
 */
const paperOf = (pigments: CloudPigments, frame: Frame): Shader => {
  const shortOfScreen = Math.max(1, Math.min(frame.width, frame.screen));
  const shortOfBox = Math.max(1, Math.min(frame.width, frame.height));

  return Haze.still({
    coral: pigments.mid,
    golden: pigments.high,
    apricot: pigments.low,
    fieldLayout: {
      angle: field.angle,
      radius: (field.radius * shortOfScreen) / shortOfBox,
      x: field.x,
      y: (field.y * frame.screen) / Math.max(1, frame.height),
    },
    preset: 0,
    cloudStrength: 0.14,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.55,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 111,
  });
};

/**
 * The fill, drawn into the box its class sizes, in the mode the page is in.
 *
 * The box is this element's, not the canvas's: a fill sizes its own canvas to its
 * parent inline, so a height stated on the canvas loses to that. The class sizes
 * the box and the canvas fills it, which is what lets a caller say `inset-0` and
 * have a paper the size of the page.
 *
 * The box is measured rather than assumed, because the painting is stated for a
 * screen and the page is as tall as its content: a build per box and mode, kept
 * while the numbers hold, so a resize re-lays the painting rather than rebuilding
 * it on every render.
 */
export const Paper = ({ className }: { className?: string }) => {
  const theme = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);

  useEffect(() => {
    const element = box.current;

    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();

      const next: Frame = {
        height: Math.round(height),
        screen: window.innerHeight,
        width: Math.round(width),
      };

      setFrame((current) =>
        current &&
        current.width === next.width &&
        current.height === next.height &&
        current.screen === next.screen
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const shader = useMemo(
    () => (frame ? paperOf(cloudPigments[theme], frame) : null),
    [frame, theme],
  );

  return (
    <div className={className} ref={box}>
      {shader ? <ShaderFill className="size-full" shader={shader} /> : null}
    </div>
  );
};
