import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Load Inter font with optimizations
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: {
    default: 'ChatCraft Studio',
    template: '%s | ChatCraft Studio'
  },
  description: 'Transform your organization knowledge into intelligent chatbots with ChatCraft Studio. Multi-tenant RAG platform for enterprises.',
  keywords: ['chatbot', 'AI', 'RAG', 'customer service', 'enterprise', 'automation'],
  authors: [{ name: 'ChatCraft Studio Team' }],
  creator: 'ChatCraft Studio',
  publisher: 'ChatCraft Studio',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'ChatCraft Studio - Intelligent Chatbot Platform',
    description: 'Transform your organization knowledge into intelligent chatbots',
    siteName: 'ChatCraft Studio',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ChatCraft Studio Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChatCraft Studio - Intelligent Chatbot Platform',
    description: 'Transform your organization knowledge into intelligent chatbots',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Favicon and app icons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        
        {/* Theme color for mobile browsers */}
        <meta name="theme-color" content="#2563eb" />
        <meta name="color-scheme" content="light dark" />
        
        {/* Viewport meta tag for responsive design */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body 
        className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}
        suppressHydrationWarning
      >
        {/* Skip to main content for accessibility */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
        >
          Skip to main content
        </a>

        {/* Main app content */}
        <div id="app-root" className="min-h-screen">
          {children}
        </div>

        {/* Portal root for modals, toasts, etc. */}
        <div id="portal-root" />

        {/* Development tools indicator (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 left-4 z-50">
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-1 rounded text-xs">
              DEV MODE
            </div>
          </div>
        )}
      </body>
    </html>
  )
}