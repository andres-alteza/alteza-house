import React from "react"
import type { Metadata, Viewport } from "next"
import { Open_Sans } from "next/font/google"
import { Providers } from "@/app/providers"
import "./globals.css"

const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" })

export const metadata: Metadata = {
  title: "Alteza House - Sistema de Gestion de Pagos",
  description: "Sistema de gestion de pagos de alquiler de habitaciones",
}

export const viewport: Viewport = {
  themeColor: "#5e35b1",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${openSans.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
