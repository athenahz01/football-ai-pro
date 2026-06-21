"use client";

import { type FormEvent } from "react";

// The Ask input, the core control. Rest shows the placeholder and the Volt submit.
// Focus is handled by the focus-within ring in CSS. Thinking swaps the submit for a
// spinner and disables input, so the state is visible without colour alone.

export function AskInput({
  value,
  onChange,
  onSubmit,
  thinking = false,
  placeholder = "Ask anything...",
  ariaLabel = "Ask a football question",
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  thinking?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className={`md-ask ${thinking ? "md-ask--thinking" : ""}`}
      onSubmit={handleSubmit}
    >
      <input
        className="md-ask-input"
        value={value}
        placeholder={thinking ? "Thinking..." : placeholder}
        aria-label={ariaLabel}
        disabled={thinking}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="submit"
        className="md-ask-submit"
        disabled={thinking || value.trim().length === 0}
        aria-label="Ask"
      >
        {thinking ? (
          <span className="md-ask-spinner" aria-hidden />
        ) : (
          <span aria-hidden>{"↑"}</span>
        )}
      </button>
    </form>
  );
}
