// RAG assistant (bonus feature): chat grounded in the extracted documents.
// Scope the conversation to all visible documents or a single one (the Review
// screen deep-links here with ?doc=<id>). Answers cite the documents they came
// from; citation chips link back to the review screen. Questions are sent one
// at a time — the local model can only run one inference at once.

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { chat, type ChatCitation } from "../api";
import { useDocuments } from "../store";
import { docLabel } from "../lib/format";

interface Message {
  who: "user" | "assistant";
  text: string;
  citations?: ChatCitation[];
  isError?: boolean;
}

const SAMPLE_QUESTIONS = [
  "Which documents are flagged, and why?",
  "What is the total amount across all invoices?",
  "Which vendor appears most often?",
];

export default function ChatPage() {
  const { docs, loading } = useDocuments();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<string>(() => params.get("doc") ?? "all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // A deep-linked doc the caller can't see (or a stale id) falls back to "all".
  useEffect(() => {
    if (scope !== "all" && !loading && !docs.some((d) => d.id === scope)) {
      setScope("all");
    }
  }, [scope, docs, loading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const scopedDoc = docs.find((d) => d.id === scope);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setInput("");
    setMessages((m) => [...m, { who: "user", text: question }]);
    setPending(true);
    try {
      const res = await chat(question, scope === "all" ? undefined : scope);
      setMessages((m) => [...m, { who: "assistant", text: res.answer, citations: res.citations }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          who: "assistant",
          isError: true,
          text: e instanceof Error ? e.message : "The assistant is unavailable right now.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-112px)] max-w-4xl flex-col">
      {/* Header: title + scope selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-border-base bg-surface-white px-5 py-4">
        <div>
          <h1 className="text-headline-md text-text-primary">Document Assistant</h1>
          <p className="text-body-sm text-on-surface-variant">
            Answers come only from your extracted documents, with citations.
          </p>
        </div>
        <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base">filter_alt</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Chat scope"
            className="max-w-[240px] rounded-lg border border-border-base bg-surface-white px-3 py-1.5 text-body-md text-text-primary"
          >
            <option value="all">All documents ({docs.length})</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {docLabel(d)} — {d.data.vendor ?? d.fileName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto border-x border-border-base bg-surface-container-low/40 p-5">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md pt-10 text-center">
            <span className="material-symbols-outlined text-5xl text-outline-variant">forum</span>
            <h2 className="mt-3 text-headline-md text-text-primary">
              {scopedDoc ? `Ask about ${docLabel(scopedDoc)}` : "Ask about your documents"}
            </h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              The local model answers from the extracted data{scopedDoc ? " of this document" : ""} —
              the first reply can take a little while.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {(scopedDoc
                ? ["Summarize this document.", "Do the line items add up?", "What should a reviewer double-check here?"]
                : SAMPLE_QUESTIONS
              ).map((q) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  disabled={pending}
                  className="rounded-lg border border-border-base bg-surface-white px-4 py-2.5 text-left text-body-md text-text-primary hover:border-secondary disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.who === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={[
                "max-w-[85%] rounded-lg px-4 py-3 text-body-md sm:max-w-[75%]",
                m.who === "user"
                  ? "bg-primary text-white"
                  : m.isError
                    ? "border border-status-error/30 bg-status-error/5 text-status-error"
                    : "border border-border-base bg-surface-white text-text-primary",
              ].join(" ")}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border-base pt-2">
                  <span className="text-label-sm uppercase text-on-surface-variant">Sources:</span>
                  {m.citations.map((c) => (
                    <Link
                      key={c.doc_id}
                      to={`/review/${encodeURIComponent(c.doc_id)}`}
                      className="rounded-full bg-secondary/10 px-2 py-0.5 text-label-sm font-semibold text-secondary hover:bg-secondary/20"
                    >
                      {docLabel({ doc_number: c.doc_number, id: c.doc_id })}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-border-base bg-surface-white px-4 py-3 text-body-md text-on-surface-variant">
              <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" aria-hidden="true" />
              Thinking… (local model)
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 rounded-b-lg border border-border-base bg-surface-white p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          placeholder={
            scopedDoc ? `Ask about ${docLabel(scopedDoc)}…` : "Ask about your documents…"
          }
          aria-label="Your question"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border-base px-3 text-body-md focus:border-secondary focus:outline-none disabled:bg-surface-container-low"
        />
        <button
          type="submit"
          disabled={pending || input.trim() === ""}
          aria-label="Send message"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-white hover:bg-primary-container disabled:opacity-50"
        >
          <span className="material-symbols-outlined">send</span>
        </button>
      </form>
    </div>
  );
}
