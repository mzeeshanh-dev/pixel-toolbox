// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ImageTools } from "@/features/image/image-tools";

beforeAll(() => {
  // jsdom lacks these browser APIs used by Radix and the encoder probe.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string) {
    callback(new Blob([], { type: type ?? "image/png" }));
  };
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("cannot decode")));
});

describe("ImageTools", () => {
  it("disables processing until an image is selected", () => {
    render(<ImageTools />);
    expect(screen.getByRole("button", { name: /convert to webp/i })).toBeDisabled();
    expect(screen.getByText(/select an image to enable processing/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /compress/i })).toBeInTheDocument();
  });

  it("shows an accessible error for a text file named .png", async () => {
    const user = userEvent.setup();
    render(<ImageTools />);
    const file = new File(["this is not an image"], "fake.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose image"), file);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not a supported image/i);
    expect(screen.getByRole("button", { name: /convert to webp/i })).toBeDisabled();
  });

  it("reports damaged files of always-decodable formats", async () => {
    const user = userEvent.setup();
    render(<ImageTools />);
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await user.upload(screen.getByLabelText("Choose image"), new File([header], "broken.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be decoded/i);
  });
});
