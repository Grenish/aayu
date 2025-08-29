"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  RotateCcw,
  Square,
  ChevronDown,
  ChevronRight,
  Brain,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Streamdown } from "streamdown";
import { ModeToggle } from "@/components/dark-toggle";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: (typeof AVAILABLE_MODELS)[number]["id"];
  thinking?: string;
  done?: boolean;
  thinkingCollapsed?: boolean;
}

const AVAILABLE_MODELS = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "Quality" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Fast" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", badge: "Lite" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", badge: "Fast 2.0" },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", badge: "Lite 2.0" },
  { id: "gemma-3n-e2b-it", name: "Gemma 3 Nano 2B", badge: "Edge 2B" },
  { id: "gemma-3n-e4b-it", name: "Gemma 3 Nano 4B", badge: "Edge 4B" },
  { id: "gemma-3-12b-it", name: "Gemma 3 12B", badge: "Mid 12B" },
] as const;

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<(typeof AVAILABLE_MODELS)[number]["id"]>(AVAILABLE_MODELS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem(`chat-${chatId}`);
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData) as { 
          initialMessage?: string; 
          model?: (typeof AVAILABLE_MODELS)[number]["id"]; 
          consumed?: boolean 
        };
        if (parsed.model) {
          setSelectedModel(parsed.model);
        }
        if (!parsed.consumed && messages.length === 0 && parsed.initialMessage) {
          append({ role: "user", content: parsed.initialMessage });
        }
        sessionStorage.setItem(`chat-${chatId}`, JSON.stringify({ ...parsed, consumed: true }));
      } catch {
        // If parse fails just ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const toggleThinking = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, thinkingCollapsed: !m.thinkingCollapsed }
        : m
    ));
  };

  const append = useCallback(
    async (message: Omit<Message, "id">) => {
      setIsLoading(true);
      setError(null);

      const userMessage: Message = { ...message, id: Date.now().toString() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            model: selectedModel,
            temperature: 0.7,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          let details = "Request failed";
          try {
            const data = await response.json();
            details = data.details || data.error || details;
          } catch {}
          throw new Error(details);
        }

        if (!response.body) throw new Error("Empty response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "",
          model: selectedModel,
          thinkingCollapsed: true,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        let fullText = "";
        let thinking = "";
        let finalContent = "";
        let isInThinking = false;
        let isInFinal = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;

          if (selectedModel === "gemini-2.5-pro") {
            // Parse thinking and final tags
            const thinkingMatch = fullText.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/);
            const finalMatch = fullText.match(/<final>([\s\S]*?)(?:<\/final>|$)/);

            if (thinkingMatch) {
              thinking = thinkingMatch[1].trim();
              isInThinking = !fullText.includes('</thinking>');
            }

            if (finalMatch) {
              finalContent = finalMatch[1].trim();
              isInFinal = !fullText.includes('</final>');
            }

            // Update message with parsed content
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      content: finalContent,
                      thinking: thinking || undefined,
                      done: fullText.includes('</final>'),
                    }
                  : m
              )
            );
          } else {
            // For non-pro models, just accumulate content
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullText }
                  : m
              )
            );
          }
        }

        // Mark as done
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, done: true }
              : m
          )
        );
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, selectedModel]
  );

  const stop = () => {
    abortControllerRef.current?.abort();
  };

  const reload = () => {
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex === -1) return;
    
    const lastUser = messages[lastUserIndex];
    // Remove last user message and all messages after it
    setMessages((prev) => prev.slice(0, lastUserIndex));
    // Re-send the message
    setTimeout(() => {
      append({ role: "user", content: lastUser.content });
    }, 100);
  };

  const retryWithFlash = () => {
    if (selectedModel === "gemini-2.5-pro") {
      setSelectedModel("gemini-2.5-flash");
      reload();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    append({ role: "user", content: text });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          
          <div className="flex-1 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Chat {chatId.substring(0, 8)}
            </p>
            <ModeToggle />
          </div>

          {/* Model Selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
            >
              <span className="font-medium">{currentModel?.name}</span>
              {currentModel?.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                  {currentModel.badge}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-10">
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between
                      ${selectedModel === model.id ? 'text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800' : 'text-gray-700 dark:text-gray-300'}
                    `}
                  >
                    <span>{model.name}</span>
                    {model.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                        {model.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLoading && (
            <button
              onClick={stop}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all flex items-center gap-1.5"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              Stop
            </button>
          )}
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {error && (
            <div className="mb-6 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3">
              <p className="font-medium mb-1">Something went wrong</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">{error.message}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={reload}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
                {/overloaded|unavailable/i.test(error.message) && selectedModel === 'gemini-2.5-pro' && (
                  <button
                    onClick={retryWithFlash}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Use Flash Model
                  </button>
                )}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mb-8 group"
              >
                <div className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium
                        ${
                          message.role === "user"
                            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                            : "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                        }
                      `}
                    >
                      {message.role === "user" ? "U" : "AI"}
                    </div>
                  </div>

                  {/* Message Content */}
                  <div className={`flex-1 space-y-2 ${message.role === "user" ? "text-right" : ""}`}>
                    {/* Thinking section (collapsible) for Pro model */}
                    {message.role === "assistant" && message.thinking && (
                      <div className="mb-2">
                        <button
                          onClick={() => toggleThinking(message.id)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-lg transition-colors border border-amber-200 dark:border-amber-800"
                        >
                          <Brain className="w-3 h-3" />
                          <span>Thinking Process</span>
                          {message.thinkingCollapsed ? (
                            <ChevronRight className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        
                        <AnimatePresence>
                          {!message.thinkingCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 font-mono whitespace-pre-wrap">
                                {message.thinking}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Main content */}
                    <div
                      className={`inline-block text-sm ${
                        message.role === "user"
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {message.content ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-800">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        message.role === "assistant" && !message.done && (
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"></span>
                          </div>
                        )
                      )}
                    </div>

                    {/* Actions for assistant messages */}
                    {message.role === "assistant" && message.content && message.done && (
                      <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(message.content, index)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded"
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                        {message.model && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800">
                            {AVAILABLE_MODELS.find(m => m.id === message.model)?.name || message.model}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div
            className={`
              relative bg-gray-50 dark:bg-gray-900 rounded-2xl
              transition-all duration-300 ease-out
              ${
                isFocused
                  ? "ring-2 ring-gray-900 dark:ring-gray-100"
                  : "ring-1 ring-gray-200 dark:ring-gray-800"
              }
            `}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Type a message..."
              className="w-full px-5 py-4 pr-12 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-[15px] leading-relaxed"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`
                absolute bottom-3.5 right-3 p-1.5 rounded-lg
                transition-all duration-200
                ${
                  input.trim() && !isLoading
                    ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 opacity-100"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 opacity-50"
                }
                disabled:cursor-not-allowed
              `}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                Enter
              </kbd>
              <span className="ml-1.5">to send</span>
              <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                Shift + Enter
              </kbd>
              <span className="ml-1.5">for new line</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}