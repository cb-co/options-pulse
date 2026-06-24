type Props = { regime: 'positive' | 'negative'; size?: 'sm' | 'md' }

export function RegimeBadge({ regime, size = 'md' }: Props) {
  const isPositive = regime === 'positive'
  const label = isPositive ? 'Positive Gamma' : 'Negative Gamma'
  const chipClass = isPositive ? 'chip chip-positive' : 'chip chip-negative'
  const fontSize = size === 'sm' ? 10 : 11
  return (
    <span className={chipClass} style={{ fontSize }}>
      {isPositive ? '▲' : '▼'} {label}
    </span>
  )
}
