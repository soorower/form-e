import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'

export interface ConfirmOptions {
  title: string
  /** More detail under the title; line breaks are kept. */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** A red confirm button, for deleting and other things that cannot be undone. */
  destructive?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * The app's own "Are you sure?" dialog, in place of window.confirm. Some
 * browsers answer window.confirm with "Cancel" without ever showing it (after
 * "don't let this site show dialogs", or in embedded and home-screen
 * browsers), so nothing that asked first could be done at all: questions
 * could not be deleted. Mounted once at the root; `useConfirm()` opens it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((answer: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no".
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const answer = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && answer(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && (
              <AlertDialogDescription className="whitespace-pre-line">
                {options.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answer(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={options?.destructive ? 'destructive' : 'default'}
              onClick={() => answer(true)}
            >
              {options?.confirmLabel ?? 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

/**
 * Asks the question in the app's own dialog and resolves to the answer.
 * Outside a ConfirmProvider (a component rendered on its own in a test) it
 * falls back on window.confirm.
 */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  return (
    confirm ??
    ((options) =>
      Promise.resolve(
        window.confirm(
          [options.title, typeof options.description === 'string' ? options.description : '']
            .filter(Boolean)
            .join('\n\n'),
        ),
      ))
  )
}
