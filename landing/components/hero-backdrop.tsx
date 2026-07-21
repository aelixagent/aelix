"use client";

import { useEffect, useRef } from "react";

/** Faint muted candlesticks drifting behind the hero — pure texture, not a chart. */
export function HeroBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const STEP = 22, CW = 12, LO = 90, HI = 210, PERIOD = 680;
    let price = 150;
    let candles: { o: number; c: number; hi: number; lo: number }[] = [];
    let raf = 0, last = 0, acc = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const snap = (v: number) => Math.round(v / 2) * 2;

    function gen() {
      const o = price;
      price = Math.max(108, Math.min(198, price + (Math.random() - 0.48) * 14));
      const c = price;
      return { o, c, hi: Math.max(o, c) + Math.random() * 8, lo: Math.min(o, c) - Math.random() * 8 };
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      canvas!.width = Math.max(1, w * dpr);
      canvas!.height = Math.max(1, h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
      const n = Math.ceil(w / STEP) + 3;
      while (candles.length < n) candles.push(gen());
      while (candles.length > n) candles.shift();
    }
    const y = (p: number, h: number) => snap(h - ((p - LO) / (HI - LO)) * h);
    function draw(off: number) {
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      for (let i = 0; i < candles.length; i++) {
        const cd = candles[i];
        const x = snap(i * STEP - off);
        ctx!.fillStyle = cd.c >= cd.o ? "#D7FE51" : "#FF5B52";
        ctx!.fillRect(snap(x + CW / 2) - 1, y(cd.hi, h), 2, Math.max(2, y(cd.lo, h) - y(cd.hi, h)));
        const yo = y(cd.o, h), yc = y(cd.c, h);
        ctx!.fillRect(x, Math.min(yo, yc), CW, Math.max(3, Math.abs(yc - yo)));
      }
    }
    function frame(t: number) {
      if (!last) last = t;
      acc += t - last;
      last = t;
      let off = (acc / PERIOD) * STEP;
      while (off >= STEP) {
        candles.push(gen());
        candles.shift();
        acc -= PERIOD;
        off -= STEP;
      }
      draw(off);
      raf = requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="hero-backdrop" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
