"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityControl({
  value,
  max,
  onChange,
  onStep,
  label = "Quantity",
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onStep?: (delta: -1 | 1) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="quantity-control">
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= 1}
        onClick={() => (onStep ? onStep(-1) : onChange(value - 1))}
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
        onClick={() => (onStep ? onStep(1) : onChange(value + 1))}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
