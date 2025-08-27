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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Streamdown } from "streamdown";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

const AVAILABLE_MODELS = [
  { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", badge: "Fast" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", badge: "Stable" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", badge: "Advanced" },
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
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Refs for smooth streaming
  const streamBufferRef = useRef<string>("");
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem(`chat-${chatId}`);
    if (storedData) {
      const { initialMessage, model } = JSON.parse(storedData);
      if (model) {
        setSelectedModel(model);
      }
      if (messages.length === 0 && initialMessage) {
        append({ role: "user", content: initialMessage });
      }
      sessionStorage.removeItem(`chat-${chatId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Close dropdown when clicking outside
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
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const updateStreamingMessage = useCallback(() => {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    // Update at ~60fps (every 16ms) for smooth rendering
    if (timeSinceLastUpdate >= 16 && streamBufferRef.current && streamingMessageIdRef.current) {
      const bufferedContent = streamBufferRef.current;
      const messageId = streamingMessageIdRef.current;
      
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: m.content + bufferedContent }
            : m
        )
      );
      
      streamBufferRef.current = "";
      lastUpdateTimeRef.current = now;
    }
    
    // Continue the animation loop while streaming
    if (streamingMessageIdRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateStreamingMessage);
    }
  }, []);

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
        
        // Create assistant message
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "",
        };
        setMessages((prev) => [...prev, assistantMessage]);
        
        // Initialize streaming
        streamingMessageIdRef.current = assistantMessage.id;
        streamBufferRef.current = "";
        lastUpdateTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(updateStreamingMessage);

        // Read stream with buffering
        let accumulatedContent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            accumulatedContent += chunk;
            streamBufferRef.current += chunk;
          }
        }
        
        // Final update to ensure all content is displayed
        if (streamBufferRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: accumulatedContent }
                : m
            )
          );
        }
        
        // Clean up streaming
        streamingMessageIdRef.current = null;
        streamBufferRef.current = "";
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        // Clean up on error
        streamingMessageIdRef.current = null;
        streamBufferRef.current = "";
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, selectedModel, updateStreamingMessage]
  );

  const stop = () => {
    abortControllerRef.current?.abort();
    // Clean up streaming
    streamingMessageIdRef.current = null;
    streamBufferRef.current = "";
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const reload = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.filter((m) => m.id !== lastUser.id));
    append({ role: "user", content: lastUser.content });
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
      {/* Minimal Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Chat {chatId.substring(0, 8)}
            </p>
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
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {error.message}
              </p>
              <button
                onClick={reload}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
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
                <div
                  className={`flex gap-3 ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
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
                  <div
                    className={`flex-1 space-y-1 ${
                      message.role === "user" ? "text-right" : ""
                    }`}
                  >
                    <div
                      className={`inline-block text-sm ${
                        message.role === "user"
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-800">
                        <Streamdown>{message.content}</Streamdown>
                      </div>
                    </div>

                    {/* Copy button for assistant messages */}
                    {message.role === "assistant" && message.content && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() =>
                            copyToClipboard(message.content, index)
                          }
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded transition-all opacity-0 group-hover:opacity-100"
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
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && !messages.find(m => m.id === streamingMessageIdRef.current) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-xs font-medium text-gray-700 dark:text-gray-300">
                AI
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form - Matching home page style */}
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