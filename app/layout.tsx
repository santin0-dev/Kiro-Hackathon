import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "MedMatch — Community Referrals", description: "Community screening, clinician assessment and referral follow-up." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
