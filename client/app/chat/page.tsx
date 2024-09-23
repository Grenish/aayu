"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import TextBox from "../components/TextBox";

const ChatComponent = () => {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isMessageAddedRef = useRef(false);

  useEffect(() => {
    const message = searchParams.get("message");
    if (message && !isMessageAddedRef.current) {
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: "user", text: message },
      ]);
      isMessageAddedRef.current = true;
      handleBotResponse(message);
    }
  }, [searchParams]);

  const handleSendMessage = async (message: string) => {
    if (message.trim() !== "") {
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: "user", text: message },
      ]);
      await handleBotResponse(message);
    }
  };

  const handleBotResponse = async (userMessage: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post("https://aayu-cljk.onrender.com/api/generate", {
        input: userMessage,
      });

      console.log("Server response:", response.data.response);

      const botResponse = response.data.response;

      setMessages((prevMessages) => [
        ...prevMessages,
        { role: "bot", text: botResponse },
      ]);
    } catch (error) {
      console.error("Error fetching bot response:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          role: "bot",
          text: "Oops! There was an error getting the response from the bot. 😓",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900 h-screen relative overflow-y-scroll">
      <div className="pb-20">
        <div className="h-full w-full max-w-4xl mx-auto px-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-2 text-white flex ${
                message.role === "user" ? "bg-neutral-800" : "bg-neutral-900"
              }`}
            >
              <div className="flex flex-col items-start justify-start mr-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`icon icon-tabler ${
                    message.role === "user"
                      ? "icon-tabler-user"
                      : "icon-tabler-crystal-ball"
                  }`}
                >
                  {message.role === "user" ? (
                    <>
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
                      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
                    </>
                  ) : (
                    <>
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M6.73 17.018a8 8 0 1 1 10.54 0" />
                      <path d="M5 19a2 2 0 0 0 2 2h10a2 2 0 1 0 0 -4h-10a2 2 0 0 0 -2 2z" />
                      <path d="M11 7a3 3 0 0 0 -3 3" />
                    </>
                  )}
                </svg>
              </div>
              <span>{message.text}</span>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-center items-center">
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8h8a8 8 0 11-8 8v-8H4z"
                ></path>
              </svg>
              <span className="text-white ml-2">Thinking...</span>
            </div>
          )}
        </div>
      </div>
      <div className="fixed w-full flex items-center justify-center bottom-5 px-4">
        <TextBox onSend={handleSendMessage} />
      </div>
    </div>
  );
};

export default function Chat() {
  return (
    <Suspense fallback={<div>Loading chat...</div>}>
      <ChatComponent />
    </Suspense>
  );
}
