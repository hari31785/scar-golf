"use client";

import { useRef } from "react";
import { cn } from "cn";

export function OtpDigitInput({
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(""));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.slice(0, length));
    const focusIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  return (
    <div
      className="flex justify-between gap-2"
      role="group"
      aria-label="6 digit verification code"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            "h-14 w-full max-w-12 rounded-xl border border-input bg-transparent text-center text-2xl font-semibold text-foreground outline-none transition-colors",
            "focus-visible:border-emerald-600 focus-visible:ring-3 focus-visible:ring-emerald-600/30",
            "disabled:opacity-50"
          )}
        />
      ))}
    </div>
  );
}
