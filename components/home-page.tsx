"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, ChevronDown } from "lucide-react";
import { nanoid } from "nanoid";
import { ModeToggle } from "./dark-toggle";

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

export default function HomePage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<(typeof AVAILABLE_MODELS)[number]["id"]>(AVAILABLE_MODELS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);

    // Generate unique chat ID
    const chatId = nanoid(10);

    // Store the initial message and model in sessionStorage to pass to chat page
    sessionStorage.setItem(
      `chat-${chatId}`,
      JSON.stringify({
        id: chatId,
        initialMessage: input.trim(),
        model: selectedModel,
        createdAt: new Date().toISOString(),
        consumed: false,
      })
    );

    // Navigate to chat page
    router.push(`/c/${chatId}`);
  };

  const suggestedPrompts = [
    "Explain a complex topic simply",
    "Help with creative writing",
    "Solve a coding problem",
    "Analyze this data",
  ];

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 flex flex-col justify-center min-h-screen py-12">
        {/* Main Content */}
        <div className="space-y-8">
          {/* Logo and Title */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900">
                <Command className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-medium text-gray-900 dark:text-gray-100">
                AI Assistant
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Start typing to begin
              </p>
            </div>
            <ModeToggle />
          </div>

          {/* Model Selector */}
          <div className="flex justify-center">
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200 border border-gray-200 dark:border-gray-800"
              >
                <span className="font-medium">{currentModel?.name}</span>
                {currentModel?.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                    {currentModel.badge}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-10">
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
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="relative">
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
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask anything..."
                className="w-full px-5 py-4 pr-12 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-[15px] leading-relaxed"
                rows={1}
                disabled={isLoading}
                autoFocus
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

            {/* Keyboard Shortcut Hint */}
            <div className="flex items-center justify-between mt-3 px-1">
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

          {/* Suggested Prompts - Only show when input is empty */}
          {!input && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 px-1 uppercase tracking-wider">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200 border border-gray-200 dark:border-gray-800"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-auto pt-12 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Built with Google Gemini · Your conversations are private and secure
          </p>
        </div>
      </div>
    </div>
  );
}