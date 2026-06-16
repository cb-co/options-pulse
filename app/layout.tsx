import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Disclaimer } from '@/components/Disclaimer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OptionPulse',
  description: 'Daily AI-generated options activity digest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <footer className="border-t mt-16 py-8 px-4 max-w-4xl mx-auto">
          <Disclaimer />
        </footer>
      </body>
    </html>
  )
}
