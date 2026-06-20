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
      <body>
        {children}
        <footer style={footerStyle}>
          World Cup data provided by StatsBomb Open Data.
        </footer>
      </body>
    </html>
  );
}

const footerStyle: React.CSSProperties = {
  maxWidth: "760px",
  margin: "0 auto",
  padding: "24px",
  fontFamily: "system-ui, sans-serif",
  fontSize: "12px",
  color: "#999",
  textAlign: "center",
};
