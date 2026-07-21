"use client";

import { useEffect } from "react";

/** Last-resort error surface (a crash in the root layout itself). It
 * renders WITHOUT the layout, so it carries its own html/body and
 * inline styles: pure black, glowing accent, no framework white. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[pea] root error", { digest: error.digest, error });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
          background: "#000",
          color: "#FFF",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <p
          style={{
            fontSize: "72px",
            fontWeight: 900,
            lineHeight: 1,
            color: "#CCFF00",
            margin: 0,
            textShadow:
              "0 0 24px rgba(204,255,0,0.55), 0 0 90px rgba(204,255,0,0.25)",
          }}
        >
          Error
        </p>
        <p style={{ fontSize: "15px", fontWeight: 300, margin: 0 }}>
          Something went wrong. Please try again.
        </p>
        {error.digest ? (
          <p style={{ fontSize: "12px", color: "#767D6C", margin: 0 }}>
            Reference {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "16px",
            padding: "12px 28px",
            borderRadius: "999px",
            border: "1px solid #CCFF00",
            background: "transparent",
            color: "#CCFF00",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
