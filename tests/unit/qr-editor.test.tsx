// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PixelToolboxDatabase, setDbForTesting } from "@/lib/db";
import { QrGenerator } from "@/features/qr/qr-generator";

beforeAll(() => {
  // Radix primitives rely on these browser APIs, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

let db: PixelToolboxDatabase;
let name: string;

beforeEach(async () => {
  name = `test-${crypto.randomUUID()}`;
  db = new PixelToolboxDatabase(name);
  setDbForTesting(db);
});

afterEach(async () => {
  setDbForTesting(null);
  db.close();
  await PixelToolboxDatabase.delete(name);
});

describe("QR editor", () => {
  it("shows an accessible, field-linked validation error for an invalid URL", async () => {
    const user = userEvent.setup();
    render(<QrGenerator />);
    const input = screen.getByLabelText("Website URL");
    await user.type(input, "example.com");

    const error = await screen.findByText("Add the protocol, for example https://example.com");
    expect(error).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
  });

  it("previews a valid code and saves it to IndexedDB as version 1", async () => {
    const user = userEvent.setup();
    render(<QrGenerator />);
    await user.type(screen.getByLabelText("Website URL"), "https://example.com/menu");
    await user.type(screen.getByLabelText("Name"), "Menu");

    expect(await screen.findByAltText("QR code preview for https://example.com/menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save to library/i }));

    expect(await screen.findByText("Saved “Menu” to your library.")).toBeInTheDocument();
    expect(await screen.findByText(/Editing/)).toBeInTheDocument();
    const codes = await db.qrCodes.toArray();
    expect(codes).toHaveLength(1);
    expect(codes[0].name).toBe("Menu");
    expect(await db.versions.count()).toBe(1);

    // Saving again without changes must not create a version.
    await user.click(screen.getByRole("button", { name: /save as new version/i }));
    expect(await screen.findByText(/no new version was created/i)).toBeInTheDocument();
    expect(await db.versions.count()).toBe(1);
  });

  it("does not change colours when warning about low contrast", async () => {
    const user = userEvent.setup();
    render(<QrGenerator />);
    const foreground = screen.getByLabelText("Foreground");
    await user.clear(foreground);
    await user.type(foreground, "#eeeeee");
    expect(await screen.findByText(/very low contrast/i)).toBeInTheDocument();
    expect(foreground).toHaveValue("#eeeeee");

    await user.clear(foreground);
    await user.type(foreground, "#12");
    await waitFor(() => expect(screen.getByText(/Use a HEX colour/)).toBeInTheDocument());
  });
});
