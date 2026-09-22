import { cn } from '#/lib/utils'

/**
 * The Form-E logo. One component so the header, the footer, and the admin
 * header cannot drift apart, and so swapping the artwork is a one-file change.
 * `public/logo.png` is the same drawing as the favicon and the PWA icons.
 */
export function BrandMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      // The artwork is its own rounded square, so it needs no frame.
      className={cn('shrink-0 rounded-xl object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}
