/**
 * Cropper pins. The first version shipped with a broken-image icon and
 * nothing else visible: the preview read from an object URL whose only
 * correct revoke point is effect cleanup, which React runs between its two
 * development mounts — so the URL was revoked out from under the image
 * already committed to state. These tests mount the real component and
 * assert the photo actually reaches the DOM.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarCropper } from "@/components/profile/AvatarCropper";

/** jsdom does not decode images, so stand in a constructor that reports
 * real dimensions and fires load — the point under test is the wiring, not
 * the decoder. */
function stubImage() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    #src = "";
    set src(v: string) {
      this.#src = v;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this.#src;
    }
  }
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
}

afterEach(() => vi.unstubAllGlobals());

function pickedFile() {
  return new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
    type: "image/jpeg",
  });
}

describe("AvatarCropper", () => {
  it("renders the picked photo rather than a dead reference", async () => {
    stubImage();
    render(
      <AvatarCropper file={pickedFile()} onCancel={() => {}} onApply={() => {}} />,
    );
    // Portalled to document.body, so query the document, not the
    // testing-library container (which is what made this pin lie first).
    const preview = await waitFor(() => {
      const el = document.querySelector<HTMLImageElement>('img[alt=""]');
      expect(el).not.toBeNull();
      return el!;
    });
    // A data URL survives the component's whole life. A blob: URL is the
    // shape that shipped broken.
    expect(preview.getAttribute("src")).toMatch(/^data:image\//);
    expect(preview.getAttribute("src")).not.toMatch(/^blob:/);
  });

  it("survives the mount/cleanup/mount that React does in development", async () => {
    stubImage();
    render(
      <AvatarCropper file={pickedFile()} onCancel={() => {}} onApply={() => {}} />,
      { reactStrictMode: true },
    );
    await waitFor(() => {
      const el = document.querySelector<HTMLImageElement>('img[alt=""]');
      expect(el?.getAttribute("src")).toMatch(/^data:image\//);
    });
    // The failure state must NOT have been reached by the discarded mount.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps its controls reachable", async () => {
    stubImage();
    render(
      <AvatarCropper file={pickedFile()} onCancel={() => {}} onApply={() => {}} />,
    );
    expect(
      await screen.findByRole("dialog", { name: "Position your photo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled(),
    );
  });

  it("reports an unreadable file instead of an empty frame", async () => {
    class DeadImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", DeadImage as unknown as typeof Image);
    render(
      <AvatarCropper file={pickedFile()} onCancel={() => {}} onApply={() => {}} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be read/i,
    );
  });
});
