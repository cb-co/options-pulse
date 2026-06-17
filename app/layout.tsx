import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Disclaimer } from '@/components/Disclaimer'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' })

export const metadata: Metadata = {
  title: 'OptionPulse',
  description: 'Daily AI-generated options activity digest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        {children}
        <footer style={{ borderTop: '1px solid var(--border)', marginTop: 80, padding: '32px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <Disclaimer />
          </div>
        </footer>
      </body>
    </html>
  )
}
