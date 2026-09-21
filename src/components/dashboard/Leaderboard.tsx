import { Crown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { initials, relativeTime, type MemberStat } from '#/lib/team/stats'
import { cn } from '#/lib/utils'

interface LeaderboardProps {
  members: MemberStat[]
  now: number
}

const MEDAL: Record<number, string> = {
  1: 'bg-amber-400/20 text-amber-600 dark:text-amber-300',
  2: 'bg-slate-400/20 text-slate-600 dark:text-slate-300',
  3: 'bg-orange-400/20 text-orange-700 dark:text-orange-300',
}

/** Team members ranked by responses collected, with today's count and a share bar. */
export function Leaderboard({ members, now }: LeaderboardProps) {
  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Add team members, or collect the first response, to start the leaderboard.
      </p>
    )
  }

  const best = members[0]?.total ?? 0

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>Member</TableHead>
            <TableHead className="text-right">Responses</TableHead>
            <TableHead className="text-right">Today</TableHead>
            <TableHead className="hidden sm:table-cell">Last active</TableHead>
            <TableHead className="hidden w-40 2xl:table-cell">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.name} className="hover:bg-transparent">
              <TableCell className="text-center">
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    member.total > 0 && MEDAL[member.rank]
                      ? MEDAL[member.rank]
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {member.rank === 1 && member.total > 0 ? <Crown className="size-3.5" /> : member.rank}
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {initials(member.name)}
                  </span>
                  <span className="font-medium">{member.name}</span>
                  {member.code && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                      {member.code}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right text-base font-bold tabular-nums">{member.total}</TableCell>
              <TableCell className="text-right tabular-nums">
                {member.today > 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    +{member.today}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {member.lastAt ? relativeTime(member.lastAt, now) : 'Not yet'}
              </TableCell>
              <TableCell className="hidden 2xl:table-cell">
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${best > 0 ? (member.total / best) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(member.share * 100)}%
                  </span>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
