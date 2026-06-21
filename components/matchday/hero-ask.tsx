"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AskInput } from "./ask-input";
import { Chip } from "./chip";

// The hero Ask action on the landing screen. It routes to the answer screen with the
// question prefilled, where the real grounded pipeline runs. The suggestions are
// questions the data can actually answer, so the first ask never produces a made up
// stat.

const SUGGESTIONS = [
  "Which player scored the most goals in the 2022 World Cup?",
  "Which team had the highest total expected goals?",
  "Who attempted the most shots, and how many?",
];

export function HeroAsk() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function go(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div>
      <AskInput
        value={question}
        onChange={setQuestion}
        onSubmit={() => go(question)}
        placeholder="Which player had the most threat under pressure?"
        ariaLabel="Ask a football question"
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
        }}
      >
        {SUGGESTIONS.map((suggestion) => (
          <Chip key={suggestion} onClick={() => go(suggestion)}>
            {suggestion}
          </Chip>
        ))}
      </div>
    </div>
  );
}
