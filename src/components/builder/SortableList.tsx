import { useId, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/** What a drag handle needs from its sortable item: spread onto the handle button. */
export interface DragHandleProps {
  ref: (node: HTMLElement | null) => void
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
}

interface SortableListProps {
  /** Ids of the items in their current order. */
  ids: string[]
  /** Called when a drag ends over another item, with the old and new positions. */
  onMove: (from: number, to: number) => void
  children: ReactNode
  className?: string
}

/**
 * A vertical list whose items can be dragged by a handle, or moved with the
 * keyboard: focus a handle, press space, use the arrow keys, press space
 * again. Wrap each item in `SortableItem` and give it a `DragHandle`.
 */
export function SortableList({ ids, onMove, children, className }: SortableListProps) {
  // A fixed id keeps the accessibility ids identical on the server and the client.
  const id = useId()
  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a plain click on the
    // handle (or on anything inside a card) is never taken for one.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) onMove(from, to)
  }

  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  )
}

interface SortableItemProps {
  id: string
  /** Renders the item; `dragging` is true while it is being moved. */
  children: (handle: DragHandleProps, dragging: boolean) => ReactNode
  className?: string
}

export function SortableItem({ id, children, className }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  // Translate only: a scale transform would squash cards of different heights.
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10', className)}>
      {children({ ref: setActivatorNodeRef, attributes, listeners }, isDragging)}
    </div>
  )
}

interface DragHandleProps2 {
  handle: DragHandleProps
  /** Accessible name, e.g. "Drag question 3". */
  label: string
  size?: 'icon' | 'icon-sm'
  className?: string
}

/** The grip button that starts a drag. */
export function DragHandle({ handle, label, size = 'icon', className }: DragHandleProps2) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={label}
      title="Drag to reorder, or press space and use the arrow keys"
      ref={handle.ref}
      {...handle.attributes}
      {...handle.listeners}
      className={cn(
        'cursor-grab touch-none text-muted-foreground active:cursor-grabbing',
        className,
      )}
    >
      <GripVertical />
    </Button>
  )
}
