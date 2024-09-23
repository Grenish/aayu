"use client";
import { useRouter } from "next/navigation";
import Suggestions from "./components/Suggestions";
import TextBox from "./components/TextBox";

export default function Home() {
  const router = useRouter();

  const handleSendMessage = (message: string) => {
    router.push(`/chat?message=${encodeURIComponent(message)}`);
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-neutral-950 px-4">
      <h1 className="text-white text-4xl md:text-5xl text-center">
        Ask Aayu Anything
      </h1>
      <div className="mt-5 w-full flex items-center justify-center">
        <TextBox onSend={handleSendMessage} />
      </div>
      {/* Hide Suggestions on smaller devices */}
      <div className="hidden md:flex">
        <Suggestions />
      </div>
    </div>
  );
}
