import { useRef } from 'react'
import { useMotionValue, useSpring, useTransform } from 'framer-motion'

export function useTilt(strength = 8) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [strength, -strength]), { stiffness: 300, damping: 30 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-strength, strength]), { stiffness: 300, damping: 30 })

  function onMouseMove(e) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.width && rect.height) {
      x.set((e.clientX - rect.left) / rect.width - 0.5)
      y.set((e.clientY - rect.top) / rect.height - 0.5)
    }
  }

  function onMouseLeave() {
    x.set(0)
    y.set(0)
  }

  return { ref, rotateX, rotateY, onMouseMove, onMouseLeave }
}
