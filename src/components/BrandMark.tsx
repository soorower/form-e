import { cn } from '#/lib/utils'

/**
 * The Form-E logo: a spine and three bars that read as an E and as a form.
 * One component so the header, the footer and the landing hero cannot drift
 * apart, and so swapping the artwork is a one-file change.
 *
 * The SVG is the master (`public/logo.svg`) and stays crisp at any size; the
 * favicon and PWA icons are rasterised from the same 64-unit grid.
 */
export function BrandMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      // The artwork is its own rounded square, so it needs no frame — but the
      // box keeps the same 15/64 radius, or a shadow would square off the
      // corners behind it.
      className={cn('shrink-0 rounded-[23.4%] object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}
