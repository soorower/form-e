import { useRef, useState, type ChangeEvent } from 'react'
import { FileSpreadsheet, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { usePictureUpload } from '#/hooks/usePictureUpload'
import { levelLabel } from '#/lib/questionnaire/cards'
import { pickText } from '#/lib/questionnaire/factory'
import {
  createAttributePictures,
  levelOccurs,
  matchWorkbookPictures,
  missingPictures,
  pictureSlots,
  setLevelPicture,
  type PictureSlot,
} from '#/lib/questionnaire/pictures'
import type {
  AttributePictures,
  ChoiceAttribute,
  ChoiceExperimentQuestion,
  Lang,
} from '#/lib/questionnaire/types'
import { readWorkbookPictures } from '#/lib/workbook-pictures'
import { LocalizedInput } from './LocalizedInput'

interface ChoicePicturesEditorProps {
  question: ChoiceExperimentQuestion
  languages: Lang[]
  onChange: (patch: Partial<ChoiceExperimentQuestion>) => void
}

const slotId = (attribute: string, slot: PictureSlot) =>
  `${attribute}\u0000${slot.alternative}\u0000${slot.level}`

/**
 * Picture rows for a choice block: per attribute, a row of pictures shown
 * above it in every scenario table, one per level (and per alternative when
 * they differ, as a rigid and a flexible road in the same condition do).
 * Pictures are uploaded one by one, or all at once from the Excel workbook
 * that already holds them beside the level names.
 */
export function ChoicePicturesEditor({ question, languages, onChange }: ChoicePicturesEditorProps) {
  const upload = usePictureUpload()
  // Uploads finish after later renders, so they patch the newest question
  // rather than the one they started from, keeping edits made meanwhile.
  const latest = useRef({ question, onChange })
  latest.current = { question, onChange }

  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const workbookInput = useRef<HTMLInputElement>(null)
  const pictureInput = useRef<HTMLInputElement>(null)
  const pendingSlot = useRef<{ attribute: string; slot: PictureSlot } | null>(null)

  const isProfile = question.layout === 'profile'
  const canDiffer = !isProfile && question.alternatives.length > 1

  function patchPictures(
    attributeKey: string,
    change: (pictures: AttributePictures | undefined) => AttributePictures | undefined,
  ) {
    const { question: current, onChange: apply } = latest.current
    apply({
      attributes: current.attributes.map((attribute) => {
        if (attribute.key !== attributeKey) return attribute
        const pictures = change(attribute.pictures)
        const { pictures: _old, ...rest } = attribute
        return pictures ? { ...rest, pictures } : rest
      }),
    })
  }

  function addPictureRow(attribute: ChoiceAttribute) {
    patchPictures(attribute.key, () => createAttributePictures(canDiffer))
    setNotice(null)
  }

  function removePictureRow(attribute: ChoiceAttribute) {
    const count = attribute.pictures?.items.length ?? 0
    if (
      count > 0 &&
      !window.confirm(
        `Remove the picture row above “${pickText(attribute.label, 'en') || attribute.key}” and its ${count} ${count === 1 ? 'picture' : 'pictures'}?`,
      )
    ) {
      return
    }
    patchPictures(attribute.key, () => undefined)
  }

  function choosePicture(attribute: string, slot: PictureSlot) {
    pendingSlot.current = { attribute, slot }
    pictureInput.current?.click()
  }

  async function handlePicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    const target = pendingSlot.current
    pendingSlot.current = null
    if (!file || !target) return
    const id = slotId(target.attribute, target.slot)
    setBusy((current) => new Set(current).add(id))
    setError(null)
    try {
      const stored = await upload(file)
      patchPictures(target.attribute, (pictures) =>
        setLevelPicture(pictures ?? createAttributePictures(canDiffer), target.slot, stored),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The picture could not be uploaded.')
    } finally {
      setBusy((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  async function handleWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    setImporting('Reading the workbook…')
    try {
      const workbook = await readWorkbookPictures(await file.arrayBuffer())
      const found = matchWorkbookPictures(latest.current.question, workbook.pictures, workbook.sheets)
      if (found.matches.length === 0) {
        setError(
          workbook.pictures.length === 0
            ? 'The workbook holds no pictures.'
            : `None of the workbook’s ${workbook.pictures.length} pictures sits beside a level name from these cards. Put each picture in the row of its level (for example “New Road (Good Condition)”), under a heading naming its alternative (“Rigid”), and try again.`,
        )
        return
      }

      // The same file (a picture used in several places) is uploaded once.
      const uploaded = new Map<string, { url: string; storageId: string }>()
      const distinct = [...new Set(found.matches.map((match) => match.picture.path))]
      for (const [index, path] of distinct.entries()) {
        setImporting(`Uploading picture ${index + 1} of ${distinct.length}…`)
        uploaded.set(path, await upload(await workbook.file(path)))
      }

      for (const attributeKey of Object.keys(found.perAlternative)) {
        patchPictures(attributeKey, (pictures) => {
          let next: AttributePictures = {
            ...(pictures ?? createAttributePictures(false)),
            perAlternative: canDiffer && found.perAlternative[attributeKey],
          }
          for (const match of found.matches) {
            if (match.attribute !== attributeKey) continue
            const stored = uploaded.get(match.picture.path)
            if (stored) next = setLevelPicture(next, match, stored)
          }
          return next
        })
      }

      const current = latest.current.question
      const parts = Object.keys(found.perAlternative).map((attributeKey) => {
        const attribute = current.attributes.find((a) => a.key === attributeKey)
        const count = found.matches.filter((match) => match.attribute === attributeKey).length
        const name = attribute ? pickText(attribute.label, 'en') || attribute.key : attributeKey
        return `${count} for ${name}${found.perAlternative[attributeKey] && canDiffer ? ' (one per alternative)' : ''}`
      })
      const ignored =
        found.unmatched > 0
          ? ` Ignored ${found.unmatched.toLocaleString()} other ${found.unmatched === 1 ? 'picture' : 'pictures'} (logos, or pictures not beside a level name).`
          : ''
      const conflicts =
        found.conflicts.length > 0
          ? ` ${found.conflicts.length} levels had two different pictures; the first one found was kept.`
          : ''
      setNotice(`Imported pictures: ${parts.join('; ')}.${ignored}${conflicts}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workbook could not be read.')
    } finally {
      setImporting(null)
    }
  }

  const withPictures = question.attributes.filter((attribute) => attribute.pictures)
  const withoutPictures = question.attributes.filter((attribute) => !attribute.pictures)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label>Pictures</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            A row of pictures above an attribute, chosen by the level each card shows, such as a
            photo of each road condition. Pictures may differ per alternative (a rigid and a
            flexible road in the same condition).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importing !== null}
          onClick={() => workbookInput.current?.click()}
        >
          {importing ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <FileSpreadsheet data-icon="inline-start" />
          )}
          {importing ?? 'Import from Excel workbook'}
        </Button>
      </div>
      <input
        ref={workbookInput}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={handleWorkbook}
      />
      <input
        ref={pictureInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handlePicture}
      />

      {withPictures.map((attribute) => {
        const pictures = attribute.pictures as AttributePictures
        const slots = pictureSlots(question, attribute)
        const levels = [...new Set(slots.map((slot) => slot.level))]
        const columns = pictures.perAlternative && canDiffer ? question.alternatives : null
        const missing = missingPictures(question, attribute).length
        return (
          <div key={attribute.key} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Above “{pickText(attribute.label, 'en') || attribute.key}”
              </p>
              <div className="flex items-center gap-2">
                {missing > 0 ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                    {missing} missing
                  </Badge>
                ) : (
                  <Badge variant="secondary">{slots.length} pictures</Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove the picture row above ${attribute.key}`}
                  onClick={() => removePictureRow(attribute)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <LocalizedInput
              value={pictures.label}
              onChange={(label) => patchPictures(attribute.key, (current) => current && { ...current, label })}
              languages={languages}
              placeholder="Row heading, e.g. Road picture"
            />
            {canDiffer && (
              <Label className="cursor-pointer gap-2 text-xs font-normal">
                <Switch
                  checked={pictures.perAlternative}
                  onCheckedChange={(perAlternative) =>
                    patchPictures(attribute.key, (current) => current && { ...current, perAlternative })
                  }
                />
                A different picture for each alternative
              </Label>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-1.5 font-medium">Level</th>
                    {(columns ?? [null]).map((alternative) => (
                      <th key={alternative?.key ?? ''} className="p-1.5 text-center font-medium">
                        {alternative
                          ? pickText(alternative.label, 'en') || alternative.key
                          : 'Every alternative'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {levels.map((level) => (
                    <tr key={level} className="border-t border-border">
                      <td className="p-1.5 align-middle whitespace-pre-line">
                        {levelLabel(question, level, 'en')}
                      </td>
                      {(columns ?? [null]).map((alternative) => {
                        const slot = { alternative: alternative?.key ?? '', level }
                        const picture = pictures.items.find(
                          (item) => item.alternative === slot.alternative && item.level === level,
                        )
                        const unused =
                          alternative !== null && !levelOccurs(question, attribute.key, alternative.key, level)
                        return (
                          <td key={slot.alternative} className="p-1.5 text-center align-middle">
                            <PictureSlotCell
                              url={picture?.url}
                              busy={busy.has(slotId(attribute.key, slot))}
                              unused={unused}
                              label={`${levelLabel(question, level, 'en')}${alternative ? `, ${alternative.key}` : ''}`}
                              onChoose={() => choosePicture(attribute.key, slot)}
                              onClear={() =>
                                patchPictures(attribute.key, (current) =>
                                  current && setLevelPicture(current, slot, null),
                                )
                              }
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {withoutPictures.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Add a picture row above:</span>
          {withoutPictures.map((attribute) => (
            <Button
              key={attribute.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addPictureRow(attribute)}
            >
              <Plus data-icon="inline-start" />
              {pickText(attribute.label, 'en') || attribute.key}
            </Button>
          ))}
        </div>
      )}

      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        To import, upload the workbook that holds the pictures: each picture in the row of its
        level’s name (English or Bangla) and, when alternatives differ, in the column headed by
        the alternative, as the pavement workbook’s EngBng sheet does. Pictures placed in cells or
        floating over them both work.
      </p>
    </div>
  )
}

function PictureSlotCell({
  url,
  busy,
  unused,
  label,
  onChoose,
  onClear,
}: {
  url: string | undefined
  busy: boolean
  unused: boolean
  label: string
  onChoose: () => void
  onClear: () => void
}) {
  if (busy) {
    return (
      <div className="mx-auto flex h-20 w-28 items-center justify-center rounded-md border border-dashed border-border">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Uploading" />
      </div>
    )
  }
  if (url) {
    return (
      <div className="group relative mx-auto h-20 w-28">
        <button
          type="button"
          onClick={onChoose}
          aria-label={`Replace the picture for ${label}`}
          className="size-full overflow-hidden rounded-md border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <img src={url} alt="" className="size-full bg-muted object-cover" />
        </button>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          aria-label={`Remove the picture for ${label}`}
          onClick={onClear}
          className="absolute -top-2 -right-2 rounded-full shadow-sm"
        >
          <X />
        </Button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label={`Upload a picture for ${label}`}
      title={unused ? 'No card shows this level for this alternative' : undefined}
      className="mx-auto flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ImagePlus className="size-4" />
      <span>{unused ? 'Not used' : 'Upload'}</span>
    </button>
  )
}
