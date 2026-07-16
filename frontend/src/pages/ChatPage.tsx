import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { chat, listModels, listChatSessions, getChatSession, deleteChatSession, type ChatCitation, type ModelOption, type ChatSession } from "../api";
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
  
  // History Sidebar state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [scope, setScope] = useState<string>(() => params.get("doc") ?? "all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listModels()
      .then((m) => {
        setModels(m);
        setModel((cur) => cur || m.find((x) => x.default_chat)?.key || m.find((x) => x.configured)?.key || "");
      })
      .catch(() => setModels([]));
    
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const s = await listChatSessions();
      setSessions(s);
    } catch {
      // ignore
    }
  }

  async function loadSession(id: string) {
    if (pending) return;
    try {
      const s = await getChatSession(id);
      setSessionId(id);
      setScope(s.scope_doc_id || "all");
      setMessages(s.messages.map(m => ({
        who: m.role as "user" | "assistant",
        text: m.content
      })));
    } catch {
      // ignore
    }
  }

  function startNewSession() {
    if (pending) return;
    setSessionId(null);
    setMessages([]);
    setScope("all");
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this chat history?")) return;
    try {
      await deleteChatSession(id);
      if (sessionId === id) startNewSession();
      loadSessions();
    } catch {
      alert("Failed to delete session.");
    }
  }

  const activeModel = models.find((m) => m.key === model);

  useEffect(() => {
    if (scope !== "all" && !loading && !docs.some((d) => d.id === scope)) {
      setScope("all");
    }
    // Context isolation for new chat mode: if not loading an existing session, changing scope resets messages
    if (!sessionId && messages.length > 0) {
       startNewSession();
    }
  }, [scope, docs, loading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const scopedDoc = docs.find((d) => d.id === scope);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setInput("");
    
    // Optimistic UI update
    setMessages((m) => [...m, { who: "user", text: question }]);
    setPending(true);
    
    try {
      const history = messages
        .filter(m => !m.isError)
        .map(m => ({ role: m.who, content: m.text }));

      const res = await chat(
        question, 
        scope === "all" ? undefined : scope, 
        model || undefined, 
        history, 
        sessionId || undefined
      );
      
      if (res.session_id && !sessionId) {
         setSessionId(res.session_id);
      }
      
      setMessages((m) => [...m, { who: "assistant", text: res.answer, citations: res.citations }]);
      
      // Refresh sidebar list to show new or updated session title
      loadSessions();
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

  const filteredSessions = sessions.filter(s => s.title?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-full bg-surface-white">
      {/* History Sidebar */}
      <div className={`flex flex-col bg-surface-container-low border-r border-border-base transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'w-72' : 'w-0'}`}>
        <div className="p-4 flex items-center justify-between min-w-[18rem]">
          <h2 className="text-title-md font-medium text-text-primary">Chat History</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-text-primary rounded-full p-1 hover:bg-surface-container-high transition-colors">
            close
          </button>
        </div>
        <div className="px-4 pb-4 min-w-[18rem]">
          <button onClick={startNewSession} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white py-2.5 px-4 text-label-lg font-medium hover:bg-primary-container transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Chat
          </button>
        </div>
        <div className="px-4 pb-2 min-w-[18rem]">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Search history..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-surface-white border border-border-base py-2 pl-9 pr-3 text-body-sm text-text-primary focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-w-[18rem] px-2 pb-4 space-y-1">
          {filteredSessions.map(s => (
            <div 
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${sessionId === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container-high text-text-primary'}`}
            >
              <div className="truncate flex-1 text-body-sm font-medium">
                {s.title || "New Chat"}
              </div>
              <button 
                onClick={(e) => handleDeleteSession(s.id, e)} 
                className="opacity-0 group-hover:opacity-100 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-status-error p-1 rounded-md transition-all"
              >
                delete
              </button>
            </div>
          ))}
          {filteredSessions.length === 0 && (
            <div className="p-4 text-center text-body-sm text-on-surface-variant">No history found.</div>
          )}
        </div>
      </div>

      {/* Main Chat Canvas */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Floating Controls at Top Left */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="flex items-center justify-center rounded-xl bg-surface-white/80 backdrop-blur-md border border-border-base px-3 py-1.5 text-text-primary hover:bg-surface-container-low shadow-sm transition-colors"
              title="Open History"
            >
              <span className="material-symbols-outlined text-[20px]">history</span>
            </button>
          )}

          {models.length > 0 && (
            <select
              value={model}
              disabled={pending}
              onChange={(e) => setModel(e.target.value)}
              className="cursor-pointer rounded-xl bg-surface-white/80 backdrop-blur-md border border-border-base px-3 py-1.5 text-body-sm font-medium text-text-primary hover:bg-surface-container-low shadow-sm focus:outline-none disabled:opacity-50"
            >
              {models.map((m) => (
                <option key={m.key} value={m.key} disabled={!m.configured}>
                  {m.label}
                  {!m.configured ? " (Key needed)" : ""}
                </option>
              ))}
            </select>
          )}

          <select
            value={scope}
            onChange={(e) => {
              if (sessionId) startNewSession(); // changing scope breaks out of old session
              setScope(e.target.value);
            }}
            className="max-w-[200px] cursor-pointer rounded-xl bg-surface-white/80 backdrop-blur-md border border-border-base px-3 py-1.5 text-body-sm font-medium text-text-primary hover:bg-surface-container-low shadow-sm focus:outline-none"
          >
            <option value="all">All docs ({docs.length})</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {docLabel(d)}
              </option>
            ))}
          </select>
        </div>

        {activeModel?.remote && (
          <div className="absolute top-4 right-4 z-10 flex items-center justify-center gap-1.5 rounded-full bg-status-review/10 px-3 py-1.5 text-label-sm font-medium text-status-review backdrop-blur-md border border-status-review/20 shadow-sm">
            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
            <span className="hidden sm:inline">Remote model</span>
          </div>
        )}

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-20 md:px-12 xl:px-[15%] space-y-8">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-6 rounded-full bg-primary/10 p-4">
                <span className="material-symbols-outlined text-4xl text-primary">smart_toy</span>
              </div>
              <h2 className="text-headline-md font-semibold text-text-primary">
                {scopedDoc ? `Ask about ${docLabel(scopedDoc)}` : "Hi, I'm your Document Assistant"}
              </h2>
              <p className="mt-2 max-w-md text-body-md text-on-surface-variant">
                I can help you summarize documents, find discrepancies, or analyze financial data across your records.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 max-w-2xl">
                {(scopedDoc
                  ? ["Summarize this document", "Do the line items add up?", "What should a reviewer double-check here?"]
                  : SAMPLE_QUESTIONS
                ).map((q) => (
                  <button
                    key={q}
                    onClick={() => void send(q)}
                    disabled={pending}
                    className="rounded-2xl border border-border-base bg-surface-white px-5 py-3 text-body-sm text-text-primary shadow-sm hover:border-primary/30 hover:bg-surface-container-low hover:shadow-md transition-all disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.who === "user" ? "justify-end" : "justify-start gap-4"}`}>
              {m.who === "assistant" && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[75%]">
                <div
                  className={[
                    "text-body-md px-5 py-3.5 whitespace-pre-wrap leading-relaxed",
                    m.who === "user"
                      ? "bg-surface-container-high text-text-primary rounded-3xl rounded-tr-sm"
                      : m.isError
                        ? "text-status-error"
                        : "text-text-primary",
                  ].join(" ")}
                >
                  {m.text}
                </div>

                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.citations.map((c) => (
                      <Link
                        key={c.doc_id}
                        to={`/review/${encodeURIComponent(c.doc_id)}`}
                        className="flex items-center gap-1 rounded-full border border-border-base bg-surface-container-low px-3 py-1 text-label-sm font-medium text-text-primary hover:bg-surface-container transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px] text-primary">description</span>
                        {docLabel({ doc_number: c.doc_number, id: c.doc_id })}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start gap-4">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              </div>
              <div className="flex items-center px-2 py-3 text-body-md text-on-surface-variant">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary/60"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "0.2s" }}></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} className="h-4" />
        </div>

        {/* Composer Input Area */}
        <div className="p-4 pb-6 w-full max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="mx-auto flex w-full items-end gap-2 rounded-[32px] bg-surface-container-low p-2 pl-6 focus-within:bg-surface-container shadow-sm transition-colors"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
              placeholder={
                scopedDoc ? `Ask about ${docLabel(scopedDoc)}...` : "Ask a question..."
              }
              aria-label="Your question"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              className="my-3 max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-body-md text-text-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || input.trim() === ""}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-container disabled:bg-surface-container-high disabled:text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
            </button>
          </form>
          <p className="mt-3 text-center text-[11px] text-on-surface-variant">
            Document Assistant can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
