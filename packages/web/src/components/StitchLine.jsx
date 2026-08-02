import { motion, useReducedMotion } from 'motion/react'

export default function StitchLine({
  orientation = 'vertical',
  length = 48,
  strokeWidth = 2,
  color = 'currentColor',
  dash = 6,
  gap = 6,
  duration = 0.9,
  delay = 0,
  ease = 'easeOut',
  revealed = true,
  className = '',
  ...props
}) {
  const reducedMotion = useReducedMotion()
  const isVertical = orientation === 'vertical'
  const viewWidth = isVertical ? strokeWidth : length
  const viewHeight = isVertical ? length : strokeWidth
  const mid = strokeWidth / 2

  const period = dash + gap
  const stitches = Math.max(1, Math.round(length / period))
  const visibleStitches = Array.from({ length: stitches }, () => `${dash} ${gap}`).join(' ')
  const leadInGap = length + gap
  const strokeDasharray = `${visibleStitches} 0 ${leadInGap}`

  return (
    <svg
      width={viewWidth}
      height={viewHeight}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {reducedMotion ? (
        <line
          x1={isVertical ? mid : 0}
          y1={isVertical ? 0 : mid}
          x2={isVertical ? mid : length}
          y2={isVertical ? length : mid}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={revealed ? 0 : length}
        />
      ) : (
        <motion.line
          x1={isVertical ? mid : 0}
          y1={isVertical ? 0 : mid}
          x2={isVertical ? mid : length}
          y2={isVertical ? length : mid}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          initial={{ strokeDashoffset: revealed ? length : 0 }}
          animate={{ strokeDashoffset: revealed ? 0 : length }}
          transition={{ duration, delay, ease }}
        />
      )}
    </svg>
  )
}

export { StitchLine }
