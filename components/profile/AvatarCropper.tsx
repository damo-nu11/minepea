"use client";

/**
 * Avatar cropper (user 2026-07-30): pick a photo, then frame it — drag to
 * pan, slider or wheel to zoom — before it is saved. Previously the pick
 * was centre-cropped silently, so a face off-centre in the source came out
 * off-centre in the avatar with no way to fix it.
 *
 * Geometry: the image is scaled to COVER the square viewport at zoom 1 and
 * the offset is clamped so it can never uncover an edge — there is no
 * combination of drag and zoom that produces a gap, so the output never
 * contains background. Export maps the viewport window back into source
 * pixels, so what the circle shows is exactly what is written.
 *
 * The house dialog contract applies (portal, focus moved in, Tab trapped,
 * Escape closes, page scroll locked, focus restored on close).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Viewport the user frames in. Output is written at OUTPUT_SIZE. */
const VIEW = 264;
/** 256 keeps a retina-sharp 112px avatar while staying far inside the
 * profile row's size budget (a 128px source was visibly soft on the page,
 * and this needs no schema change). */
export const OUTPUT_SIZE = 256;
const MAX_ZOOM = 4;
/**
 * The profiles.avatar column and the API route both cap at 65,536 chars,
 * and an over-cap value is coerced to null and WRITTEN — i.e. it wipes the
 * avatar instead of failing loudly. Measured: a real photo at 256px q0.85
 * is 5-8K chars, but pure high-entropy noise reaches ~62.8K, so the worst
 * case clears by only 4%. Step the quality down until it provably fits
 * rather than trusting that nobody uploads a noise field.
 */
const MAX_DATA_URL = 60_000;
const QUALITY_LADDER = [0.85, 0.7, 0.55, 0.4];

export function AvatarCropper({
  file,
  onCancel,
  onApply,
}: {
  file: File;
  onCancel(): void;
  onApply(dataUrl: string): void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  /** Live pointers, so two fingers can pinch-zoom on a phone — the slider
   * alone would make zoom a desktop-only affordance. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const pointerDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Decode the pick. An object URL is revoked as soon as it has loaded so
  // a cancelled crop leaks nothing.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      // Centre it in the same commit the image lands, so there is never a
      // frame of the photo pinned to the top-left corner.
      const base = Math.max(
        VIEW / image.naturalWidth,
        VIEW / image.naturalHeight,
      );
      setImg(image);
      setOffset({
        x: (VIEW - image.naturalWidth * base) / 2,
        y: (VIEW - image.naturalHeight * base) / 2,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setFailed(true);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Scale at which the image exactly covers the viewport. */
  const baseScale = img
    ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight)
    : 1;
  const scale = baseScale * zoom;
  const drawnW = img ? img.naturalWidth * scale : 0;
  const drawnH = img ? img.naturalHeight * scale : 0;

  /** Keep the image covering the frame: no drag or zoom can open a gap. */
  const clamp = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(VIEW - drawnW, o.x)),
      y: Math.min(0, Math.max(VIEW - drawnH, o.y)),
    }),
    [drawnW, drawnH],
  );

  /** Clamped at READ time, so zooming out re-frames without a state
   * round trip and the stored offset is never the source of a gap. */
  const pos = clamp(offset);

  // Dialog contract.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const f = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus();
    };
  }, [onCancel]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger starts a pinch and ends any drag in progress, so
    // the image does not lurch toward one finger mid-gesture.
    if (pointers.current.size === 2) {
      pinchRef.current = { dist: pointerDistance(), zoom };
      dragRef.current = null;
    } else {
      dragRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointers.current.size === 2) {
      const d = pointerDistance();
      if (d > 0 && pinch.dist > 0)
        setZoom(
          Math.min(MAX_ZOOM, Math.max(1, (pinch.zoom * d) / pinch.dist)),
        );
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: e.clientX - d.x, y: e.clientY - d.y }));
  };

  const endDrag = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    // Lifting one finger of a pinch must not resume a stale drag anchor.
    if (pointers.current.size === 0) dragRef.current = null;
    else {
      const [p] = [...pointers.current.values()];
      dragRef.current = { x: p.x - pos.x, y: p.y - pos.y };
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!img) return;
    setZoom((z) =>
      Math.min(MAX_ZOOM, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))),
    );
  };

  /** Arrow keys nudge the frame — the drag surface is otherwise
   * mouse-only, which would put the whole feature out of reach. */
  const onFrameKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setOffset((o) => clamp({ x: o.x + m[0], y: o.y + m[1] }));
  };

  const apply = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Map the viewport window back into source pixels: what the circle
    // shows is exactly what gets written.
    const sx = -pos.x / scale;
    const sy = -pos.y / scale;
    const s = VIEW / scale;
    ctx.drawImage(img, sx, sy, s, s, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    let out = canvas.toDataURL("image/jpeg", QUALITY_LADDER[0]);
    for (let i = 1; i < QUALITY_LADDER.length && out.length > MAX_DATA_URL; i++)
      out = canvas.toDataURL("image/jpeg", QUALITY_LADDER[i]);
    onApply(out);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        aria-hidden
        onClick={onCancel}
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Position your photo"
        className="relative flex w-full max-w-[340px] flex-col gap-4 rounded-[16px] border border-line-slate bg-bg p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-wordmark text-[17px] font-bold tracking-[-0.01em] text-fg">
            Position your photo
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            className="focus-ring -mr-1 -mt-1 flex size-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg"
          >
            ✕
          </button>
        </div>

        {failed ? (
          <p role="alert" className="py-8 text-center text-[14px] text-danger">
            That image could not be read. Try another file.
          </p>
        ) : (
          <>
            {/* The frame. Everything outside the circle is dimmed so the
                crop is unambiguous before it is committed. */}
            <div
              role="group"
              aria-label="Drag to reposition, arrow keys to nudge"
              tabIndex={0}
              onKeyDown={onFrameKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onWheel={onWheel}
              style={{ width: VIEW, height: VIEW }}
              className="focus-ring relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-[12px] bg-surface active:cursor-grabbing"
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL, next/image cannot help
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    width: drawnW,
                    height: drawnH,
                    maxWidth: "none",
                  }}
                />
              )}
              {/* Circular mask: one inscribed circle casting a huge
                  outward shadow, clipped by the frame's overflow. Plain
                  box-shadow rather than a mask-image, which renders
                  inconsistently across engines. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border border-accent/60"
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)" }}
              />
            </div>

            <label className="flex items-center gap-3">
              <span className="micro-label shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom"
                className="focus-ring h-1 w-full cursor-pointer appearance-none rounded-full bg-line-slate accent-accent"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="focus-ring h-10 flex-1 cursor-pointer rounded-full border-[1.5px] border-line-slate text-[14px] font-semibold text-fg-body transition-colors hover:border-fg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!img}
                className="focus-ring h-10 flex-1 cursor-pointer rounded-full border-[1.5px] border-accent text-[14px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light disabled:cursor-default disabled:opacity-50"
              >
                Save photo
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
