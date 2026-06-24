import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aklan Referral Monitoring Dashboard",
  description:
    "PHeRef Connectathon — referral monitoring indicators sourced live from FHIR R4.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
