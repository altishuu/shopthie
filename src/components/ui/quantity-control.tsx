"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityControl({
  value,
  max,
  onChange,
  label = "Quantity",
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="quantity-control">
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          const amount = Number(event.currentTarget.value);
          if (Number.isSafeInteger(amount) && amount >= 1 && amount <= max) onChange(amount);
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
