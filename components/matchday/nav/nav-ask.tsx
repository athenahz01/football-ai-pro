"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AskInput } from "../ask-input";

// The persistent Ask field for the desktop top nav. Submitting routes to the answer
// screen with the question prefilled, where the real grounded pipeline runs. It does
// not call the API itself, so the Ask contract is untouched. Route changes use the
// client router, so there is no full reload.

export function NavAsk() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function submit() {
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      return;
    }
    router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
    setQuestion("");
  }

  return (
    <div className="md-topnav-ask">
      <AskInput
        value={question}
        onChange={setQuestion}
        onSubmit={submit}
        placeholder="Ask anything..."
        ariaLabel="Ask a football question"
      />
    </div>
  );
}
