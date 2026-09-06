import { useEffect, useRef } from 'react'
import { useMotionValue, useTransform, animate } from 'framer-motion'

export function AnimatedNumber({ value, format = (v) => Math.round(v) }) {
  const motionVal = useMotionValue(0)
  const rounded = useTransform(motionVal, (v) => format(v))
  const ref = useRef(null)

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 0.8, ease: 'easeOut' })
    return controls.stop
  }, [value, motionVal])

  useEffect(() => {
    const unsubscribe = rounded.on('change', (v) => {
      if (ref.current) ref.current.textContent = v
    })
    return unsubscribe
  }, [rounded])

  return <span ref={ref}>{format(value)}</span>
}
