import { useRef, useState, useEffect } from 'react'

export function useFlashOnChange(value, duration = 600) {
  const prevValue = useRef(value)
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (prevValue.current !== value && prevValue.current !== undefined && prevValue.current !== '') {
      setFlashing(true)
      const timer = setTimeout(() => setFlashing(false), duration)
      prevValue.current = value
      return () => clearTimeout(timer)
    }
    prevValue.current = value
  }, [value, duration])

  return flashing
}
