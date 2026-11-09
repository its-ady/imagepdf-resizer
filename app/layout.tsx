import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { OfflineIndicator } from '@/components/offline-indicator'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const _inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const _spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: 'Image & PDF Resizer',
  description: 'Resize your images and PDFs to any size. Fast, free, private, and works offline.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icons/icon-32.webp', sizes: '32x32', type: 'image/webp' }],
    apple: [{ url: '/icons/apple-touch-icon.webp', sizes: '180x180', type: 'image/webp' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Image & PDF Resizer',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

// Pinch-zoom stays enabled on purpose (accessibility, and needed to zoom into PDF pages while signing).
export const viewport: Viewport = {
  themeColor: '#0d9488',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${_inter.variable} ${_spaceGrotesk.variable} font-sans antialiased`}>
        <PwaRegister />
        <OfflineIndicator />
        {children}
      </body>
    </html>
  )
}
