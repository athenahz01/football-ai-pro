import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Football AI Pro",
  description: "Public football analytics app scaffold.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
