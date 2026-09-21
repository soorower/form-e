import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { UserPlus, X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Badge } from '#/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { useConvexReady } from '#/lib/convex/hooks'

interface SurveyorAssignmentProps {
  questionnaireId: string
  /** Builders and admins may add and remove; surveyors only see the list. */
  canEdit: boolean
}

function errorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * The surveyor accounts on a survey's team. Assigning one is what makes the
 * survey appear on that surveyor's "My surveys" page; their responses are
 * recorded under their account name and code.
 */
export function SurveyorAssignment({ questionnaireId, canEdit }: SurveyorAssignmentProps) {
  const ready = useConvexReady()
  const members = useQuery(api.teams.members, ready ? { questionnaireId } : 'skip')
  const available = useQuery(api.teams.surveyors, ready && canEdit ? {} : 'skip')
  const assign = useMutation(api.teams.assign)
  const unassign = useMutation(api.teams.unassign)
  const [error, setError] = useState<string | null>(null)

  const assigned = new Set((members ?? []).map((member) => member.email))
  const open = (available ?? []).filter((surveyor) => !assigned.has(surveyor.email))

  async function run(task: Promise<unknown>) {
    setError(null)
    try {
      await task
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {members === undefined ? (
          <span className="text-xs text-muted-foreground">Loading surveyors…</span>
        ) : members.length === 0 ? (
          <span className="text-xs text-muted-foreground">No surveyor accounts on this team yet.</span>
        ) : (
          members.map((member) => (
            <Badge key={member.email} variant="secondary" className="gap-1.5 pr-1">
              {member.name}
              {member.code && (
                <span className="font-mono text-[10px] font-semibold opacity-70">{member.code}</span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${member.name} from the team`}
                  onClick={() => void run(unassign({ questionnaireId, email: member.email }))}
                  className="rounded-full p-0.5 transition-colors hover:bg-foreground/10"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : (
                <span className="w-1" />
              )}
            </Badge>
          ))
        )}
      </div>
      {canEdit &&
        (open.length > 0 ? (
          <Select
            value={null}
            onValueChange={(value) => {
              if (value) void run(assign({ questionnaireId, email: String(value) }))
            }}
            items={Object.fromEntries(
              open.map((surveyor) => [
                surveyor.email,
                surveyor.code ? `${surveyor.name} (${surveyor.code})` : surveyor.name,
              ]),
            )}
          >
            <SelectTrigger size="sm" className="min-w-52" aria-label="Add a surveyor to the team">
              <UserPlus className="size-3.5" aria-hidden="true" />
              <SelectValue placeholder="Add a surveyor…" />
            </SelectTrigger>
            <SelectContent>
              {open.map((surveyor) => (
                <SelectItem key={surveyor.email} value={surveyor.email}>
                  {surveyor.name}
                  {surveyor.code ? ` (${surveyor.code})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          available !== undefined && (
            <p className="text-xs text-muted-foreground">
              {available.length === 0
                ? 'No approved surveyor accounts yet. The admin approves sign-ups as surveyors.'
                : 'Every approved surveyor is already on this team.'}
            </p>
          )
        ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
