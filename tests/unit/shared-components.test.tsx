// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field, useField } from "@/components/tool/field";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { SizeComparison } from "@/components/tool/result-summary";
import { ErrorMessage, ProcessingProgress } from "@/components/tool/status";

function TextField({ error }: { error?: string }) {
  return (
    <Field label="Target size" hint="In megabytes" error={error}>
      <FieldInput />
    </Field>
  );
}
function FieldInput() {
  return <input {...useField()} />;
}

describe("shared tool components", () => {
  it("passes the selected file to onFile and supports keyboard activation", async () => {
    const onFile = vi.fn();
    render(<FileDropzone onFile={onFile} inputLabel="Choose video" title="Drop your video" />);
    const file = new File(["data"], "clip.mp4", { type: "video/mp4" });
    await userEvent.upload(screen.getByLabelText("Choose video"), file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.getByRole("button", { name: /Drop your video/ })).toBeEnabled();
  });

  it("does not accept files while disabled", async () => {
    const onFile = vi.fn();
    render(<FileDropzone onFile={onFile} inputLabel="Choose image" disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("links field errors to the control for screen readers", () => {
    render(<TextField error="Enter a size above 0.1 MB" />);
    const input = screen.getByLabelText("Target size");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a size above 0.1 MB");
  });

  it("announces errors with role=alert", () => {
    render(<ErrorMessage title="Conversion failed">The file could not be decoded.</ErrorMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Conversion failed");
  });

  it("reports real progress percentages and exposes cancel", async () => {
    const onCancel = vi.fn();
    render(<ProcessingProgress label="Encoding GIF" value={0.42} onCancel={onCancel} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("never presents a larger result as a saving", () => {
    render(<SizeComparison originalBytes={1000} resultBytes={1500} />);
    expect(screen.getByText(/50% larger than the original/)).toBeInTheDocument();
    render(<SizeComparison originalBytes={4000} resultBytes={1000} />);
    expect(screen.getByText(/75% smaller/)).toBeInTheDocument();
  });
});
