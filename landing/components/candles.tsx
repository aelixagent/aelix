"use client";

import { useEffect, useRef } from "react";
import { GREEN, RED } from "@/lib/brand";

type Candle = { o: number; c: number; hi: number; lo: number };

/** Animated pixel candlestick ticker. Calls onTick(price, changePct) each new bar. */
export function Candles({ onTick }: { onTick?: (price: number, changePct: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onTick);
  cb.current = onTick;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const STEP = 16, CW = 9, LO = 95, HI = 205, PERIOD = 520;
    let price = 158;
    let candles: Candle[] = [];
    let raf = 0, last = 0, acc = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const snap = (v: number) => Math.round(v / 2) * 2;

    function gen(): Candle {
      const o = price;
      price = Math.max(112, Math.min(196, price + (Math.random() - 0.47) * 12));
      const c = price;
      const hi = Math.max(o, c) + Math.random() * 7;
      const lo = Math.min(o, c) - Math.random() * 7;
      return { o, c, hi, lo };
    }

    function report() {
      if (!cb.current || candles.length < 2) return;
      const ref0 = candles[0].o;
      const lastC = candles[candles.length - 1].c;
      cb.current(lastC, ((lastC - ref0) / ref0) * 100);
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
      report();
    }

    function y(p: number, h: number) {
      return snap(h - ((p - LO) / (HI - LO)) * h);
    }

    function draw(offset: number) {
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      for (let i = 0; i < candles.length; i++) {
        const cd = candles[i];
        const x = snap(i * STEP - offset);
        const up = cd.c >= cd.o;
        ctx!.fillStyle = up ? GREEN : RED;
        // wick
        ctx!.fillRect(snap(x + CW / 2) - 1, y(cd.hi, h), 2, Math.max(2, y(cd.lo, h) - y(cd.hi, h)));
        // body
        const yo = y(cd.o, h), yc = y(cd.c, h);
        const top = Math.min(yo, yc);
        const bh = Math.max(3, Math.abs(yc - yo));
        ctx!.fillRect(x, top, CW, bh);
      }
    }

    function frame(t: number) {
      if (!last) last = t;
      acc += t - last;
      last = t;
      let offset = (acc / PERIOD) * STEP;
      while (offset >= STEP) {
        candles.push(gen());
        candles.shift();
        acc -= PERIOD;
        offset -= STEP;
        report();
      }
      draw(offset);
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

  return <canvas ref={ref} />;
}
