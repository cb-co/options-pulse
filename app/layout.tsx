import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
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
        <footer style={{ borderTop: '1px solid var(--border)', marginTop: 80, padding: '28px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <Disclaimer />
            <nav style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
              <Link href="/movers" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>Top movers</Link>
              <Link href="/pricing" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>Pricing</Link>
              <Link href="/dashboard" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>Dashboard</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}
