import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import type { Questionnaire } from '#/lib/questionnaire/types'

interface TeamEditorProps {
  questionnaire: Questionnaire
  onChange: (patch: Partial<Questionnaire>) => void
  onDone: () => void
}

const SAVE_DELAY_MS = 400

type Draft = Pick<Questionnaire, 'teamName' | 'responseTarget' | 'enumerators'>

/**
 * Team name, response target, and the member list. The same fields live in the
 * survey settings.
 *
 * Edits are held locally and saved after a short pause. Without that, every
 * keystroke would round-trip to the server and the reply — built from
 * whatever the server had a moment ago — could overwrite a name still being
 * typed. That matters most on a slow field connection.
 */
export function TeamEditor({ questionnaire, onChange, onDone }: TeamEditorProps) {
  const [draft, setDraft] = useState<Draft>({
    teamName: questionnaire.teamName,
    responseTarget: questionnaire.responseTarget,
    enumerators: questionnaire.enumerators,
  })
  const dirty = useRef(false)

  // Re-seed when the panel switches to a different team, not on every save.
  useEffect(() => {
    dirty.current = false
    setDraft({
      teamName: questionnaire.teamName,
      responseTarget: questionnaire.responseTarget,
      enumerators: questionnaire.enumerators,
    })
  }, [questionnaire.id])

  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => {
      dirty.current = false
      onChange(draft)
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, onChange])

  function edit(patch: Partial<Draft>) {
    dirty.current = true
    setDraft((current) => ({ ...current, ...patch }))
  }

  /** Save immediately rather than waiting out the timer. */
  function finish() {
    if (dirty.current) {
      dirty.current = false
      onChange(draft)
    }
    onDone()
  }

  const { enumerators } = draft

  return (
    <div className="space-y-5 rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dash-team-name">Team name</Label>
          <Input
            id="dash-team-name"
            value={draft.teamName}
            onChange={(event) => edit({ teamName: event.target.value })}
            placeholder="Sylhet field team"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dash-target">Response target</Label>
          <Input
            id="dash-target"
            type="number"
            min={0}
            value={draft.responseTarget || ''}
            onChange={(event) =>
              edit({ responseTarget: Math.max(0, Number(event.target.value) || 0) })
            }
            placeholder="500"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Members</Label>
        <div className="space-y-2">
          {enumerators.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={name}
                aria-label={`Member ${index + 1}`}
                placeholder="Name"
                className="max-w-sm"
                onChange={(event) =>
                  edit({
                    enumerators: enumerators.map((n, i) =>
                      i === index ? event.target.value : n,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove member ${index + 1}`}
                onClick={() => edit({ enumerators: enumerators.filter((_, i) => i !== index) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => edit({ enumerators: [...enumerators, ''] })}
        >
          <Plus data-icon="inline-start" />
          Add member
        </Button>
        <p className="text-xs text-muted-foreground">
          Names for tablets used without signing in: members pick theirs before collecting, so every
          response counts for them here. Surveyors with their own account are added above and need
          no name here.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={finish}>
          Done
        </Button>
      </div>
    </div>
  )
}
