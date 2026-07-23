/**
 * Agent launcher wiring. The URL is the whole product here, so the pins are
 * that it is present and copyable, plus the dialog contract the rest of the
 * app's modals hold to (focus in, Escape out, scroll lock).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentFab } from "./AgentFab";

const open = () => {
  render(<AgentFab />);
  fireEvent.click(
    screen.getByRole("button", { name: "Deploy a mining agent" }),
  );
};

describe("AgentFab", () => {
  it("stays out of the way until asked", () => {
    render(<AgentFab />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Deploy a mining agent" }),
    ).toBeInTheDocument();
  });

  it("shows the agent URL and links to the doc", () => {
    open();
    const dialog = screen.getByRole("dialog", {
      name: "Deploy a Mining Agent",
    });
    expect(dialog.textContent).toContain("https://www.minepea.com/skill.md");
    expect(
      screen.getByRole("link", { name: /Open Agent Docs/ }),
    ).toHaveAttribute("href", "/skill.md");
  });

  it("copies the URL and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy agent URL" }));
    expect(writeText).toHaveBeenCalledWith("https://www.minepea.com/skill.md");
    // The icon swap alone is invisible to assistive tech.
    expect(
      await screen.findByText("Agent URL copied to clipboard"),
    ).toBeInTheDocument();
  });

  it("Escape closes it and the page scroll-lock is released", () => {
    open();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
