import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Vitality — Community Care", description: "Fictional care-handoff prototype with clinician-reviewed Bedrock documentation drafts." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
