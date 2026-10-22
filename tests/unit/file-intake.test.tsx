// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileIntake } from "@/components/tool/file-intake";

function paste(target: EventTarget, files: File[]) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: Object.assign([...files], { item: (index: number) => files[index] }),
      items: files.map((file) => ({ kind: "file", getAsFile: () => file })),
    },
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("FileIntake (paste and page-wide drop)", () => {
  it("loads a pasted file (Ctrl+V)", () => {
    const onFile = vi.fn();
    render(<FileIntake onFile={onFile} label="Drop the video" />);
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    const event = paste(document.body, [file]);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves ordinary text paste alone", () => {
    const onFile = vi.fn();
    render(
      <>
        <FileIntake onFile={onFile} label="Drop the image" />
        <input aria-label="Name" />
      </>,
    );
    const event = paste(screen.getByLabelText("Name"), []);
    expect(onFile).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores pastes while disabled (e.g. during processing)", () => {
    const onFile = vi.fn();
    render(<FileIntake onFile={onFile} enabled={false} label="Drop the image" />);
    paste(document.body, [new File(["x"], "a.png", { type: "image/png" })]);
    expect(onFile).not.toHaveBeenCalled();
  });

  it("shows a drop overlay while files are dragged over the page and loads the dropped file", () => {
    const onFile = vi.fn();
    render(<FileIntake onFile={onFile} label="Drop the image to load it" />);
    const file = new File(["x"], "photo.png", { type: "image/png" });
    const drag = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [file], items: [] } });
      act(() => {
        window.dispatchEvent(event);
      });
    };
    drag("dragenter");
    expect(screen.getByText("Drop the image to load it")).toBeInTheDocument();
    drag("drop");
    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.queryByText("Drop the image to load it")).not.toBeInTheDocument();
  });
});
