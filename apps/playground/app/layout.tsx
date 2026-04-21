import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RDBMS ERD Playground",
  description: "ERD designer playground"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
