import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";

const Mont = Montserrat({ subsets: ["latin"] });

const Pop = Poppins({ weight: ["400"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aayu",
  description: "Chat with Aayu ai",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={Pop.className}>{children}</body>
    </html>
  );
}
