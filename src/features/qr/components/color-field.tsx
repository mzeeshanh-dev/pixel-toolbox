"use client";

import { Field, useField } from "@/components/tool/field";
import { Input } from "@/components/ui/input";
import { normalizeHex } from "../lib/colors";

function HexInput({ value, onChange, disabled, label }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string }) {
  const field = useField();
  const normalized = normalizeHex(value);
  return (
    <div className="flex items-center gap-2">
      <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-input shadow-xs has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
        <span className="absolute inset-0" style={{ backgroundColor: normalized ?? "transparent" }} aria-hidden />
        <input
          type="color"
          value={normalized ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={`${label} picker`}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      <Input
        {...field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        placeholder="#000000"
        className="font-mono uppercase"
      />
    </div>
  );
}

/** Native colour picker paired with a validated HEX text input. Invalid values are kept, not replaced. */
export function ColorField({
  label,
  value,
  onChange,
  error,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      <HexInput value={value} onChange={onChange} disabled={disabled} label={label} />
    </Field>
  );
}
