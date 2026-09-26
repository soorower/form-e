import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { ArrowLeft, Download } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { PaperForm } from '#/components/paper/PaperForm'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { formatSurveyNumber, pickText } from '#/lib/questionnaire/factory'
import {
  MAX_PAPER_COPIES,
  PAPER_SIZES,
  paperSerials,
  type PaperSize,
} from '#/lib/questionnaire/paper'
import type { Lang } from '#/lib/questionnaire/types'

export interface PrintSearch {
  from?: number
  to?: number
  paper?: PaperSize
}

/** Reads the print page's query string: `?from=101&to=200&paper=legal`. */
export function validatePrintSearch(search: Record<string, unknown>): PrintSearch {
  const whole = (value: unknown) => {
    const number = Math.floor(Number(value))
    return Number.isFinite(number) && number >= 1 ? number : undefined
  }
  return {
    from: whole(search.from),
    to: whole(search.to),
    paper: search.paper === 'legal' || search.paper === 'a4' ? search.paper : undefined,
  }
}

const NOBODY = '__nobody__'

/**
 * Paper copies of a survey for a block of survey numbers, one copy per
 * number, laid out for A4 or Legal. "Download PDF" opens the browser's print
 * window, where "Save as PDF" writes the file: the browser lays out Bangla
 * script properly, which PDF libraries in the page cannot. Each copy shows
 * the cards its number gets (the plan row for that number), so a surveyor
 * given 101–200 carries exactly the forms the tablet would have shown.
 */
export function PrintPage({ surveyId, search }: { surveyId: string; search: PrintSearch }) {
  const paths = useSurveyPaths()
  const ready = useConvexReady()
  const stored = useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip')
  const questionnaire = useMemo(() => decodeQuestionnaire(stored), [stored])
  const members = useQuery(api.teams.members, ready ? { questionnaireId: surveyId } : 'skip')
  const myRanges = useQuery(api.teams.myRanges, ready ? {} : 'skip')
  const { viewer, canBuild, isSurveyor } = useViewer()

  const [from, setFrom] = useState(search.from ? String(search.from) : '')
  const [to, setTo] = useState(search.to ? String(search.to) : '')
  const [paper, setPaper] = useState<PaperSize>(search.paper ?? 'a4')
  const [lang, setLang] = useState<Lang | null>(null)
  const [person, setPerson] = useState<string>(NOBODY)

  const ranged = (members ?? []).filter((member) => member.range !== null)
  const mine = myRanges?.find((range) => range.questionnaireId === surveyId)

  // Fill in the caller's own block (a surveyor opening their forms) or the
  // one named in the link, once it is known.
  useEffect(() => {
    if (search.from !== undefined || !mine) return
    setFrom((current) => current || String(mine.start))
    setTo((current) => current || String(mine.end))
  }, [mine, search.from])
  useEffect(() => {
    if (person !== NOBODY || !members) return
    const start = Number(from)
    const owner = members.find((member) => member.range?.start === start)
    if (owner) setPerson(owner.email)
  }, [members, from, person])

  if (questionnaire === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }
  if (questionnaire === null) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not found</h1>
        <Button className="mt-6" nativeButton={false} render={<Link to={paths.list} />}>
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
      </main>
    )
  }

  const language = lang ?? questionnaire.defaultLanguage
  const start = Number(from) || 1
  const end = Number(to) || start
  const serials = paperSerials(start, end)
  const capped = end - start + 1 > MAX_PAPER_COPIES
  const chosen = members?.find((member) => member.email === person) ?? null
  const enumerator = chosen
    ? chosen.name
    : isSurveyor && mine && start >= mine.start && end <= mine.end
      ? (viewer?.displayName ?? '')
      : ''
  const title = pickText(questionnaire.title, questionnaire.defaultLanguage) || 'Untitled survey'
  const firstNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serials[0])
  const lastNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serials[serials.length - 1])

  function download() {
    // The saved PDF takes its name from the page title.
    const previous = document.title
    const slug = title.replace(/[\\/:*?"<>|.]+/g, '').trim().replace(/\s+/g, '-').toLowerCase()
    document.title = `${slug || 'survey'}-paper-forms-${firstNumber}-to-${lastNumber}`
    const restore = () => {
      document.title = previous
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  return (
    <main className="page-wrap px-4 py-8 print:m-0 print:max-w-none print:p-0">
      <style>{`@page { size: ${PAPER_SIZES[paper].css}; margin: 12mm; }
@media print { html, body { background: #fff !important; } }`}</style>

      <div className="mx-auto mb-6 max-w-3xl space-y-4 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={canBuild ? <Link to={paths.editor} params={{ surveyId }} /> : <Link to={paths.list} />}
        >
          <ArrowLeft data-icon="inline-start" />
          {canBuild ? 'Back to the editor' : 'My surveys'}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Paper forms · {title}</CardTitle>
            <CardDescription>
              One printed copy per survey number, for interviewing without a tablet. Each copy
              carries its survey number and the scenario cards that number gets, the same ones a
              tablet would show for it. Download PDF opens the print window: choose{' '}
              <strong>Save as PDF</strong> as the destination.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {ranged.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Surveyor</Label>
                <Select
                  value={person}
                  onValueChange={(value) => {
                    const next = String(value ?? NOBODY)
                    setPerson(next)
                    const member = ranged.find((candidate) => candidate.email === next)
                    if (member?.range) {
                      setFrom(String(member.range.start))
                      setTo(String(member.range.end))
                    }
                  }}
                  items={{
                    [NOBODY]: 'Any numbers (no name printed)',
                    ...Object.fromEntries(
                      ranged.map((member) => [
                        member.email,
                        `${member.name}${member.code ? ` (${member.code})` : ''} · ${member.range!.start}–${member.range!.end}`,
                      ]),
                    ),
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOBODY}>Any numbers (no name printed)</SelectItem>
                    {ranged.map((member) => (
                      <SelectItem key={member.email} value={member.email}>
                        {member.name}
                        {member.code ? ` (${member.code})` : ''} · {member.range!.start}–{member.range!.end}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="print-from">From survey no.</Label>
              <Input
                id="print-from"
                type="number"
                min={1}
                value={from}
                placeholder="1"
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="print-to">To survey no.</Label>
              <Input
                id="print-to"
                type="number"
                min={1}
                value={to}
                placeholder={String(start)}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Paper size</Label>
              <Select
                value={paper}
                onValueChange={(value) => setPaper(value === 'legal' ? 'legal' : 'a4')}
                items={{ a4: PAPER_SIZES.a4.label, legal: PAPER_SIZES.legal.label }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">{PAPER_SIZES.a4.label}</SelectItem>
                  <SelectItem value="legal">{PAPER_SIZES.legal.label}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {questionnaire.languages.length > 1 && (
              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={language}
                  onValueChange={(value) => setLang(value === 'bn' ? 'bn' : 'en')}
                  items={{ en: 'English', bn: 'বাংলা' }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {questionnaire.languages.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code === 'bn' ? 'বাংলা' : 'English'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {serials.length} {serials.length === 1 ? 'copy' : 'copies'}: {firstNumber} to{' '}
                {lastNumber}
                {capped && ` (at most ${MAX_PAPER_COPIES} at a time; print the rest as a second file)`}
              </p>
              <Button onClick={download}>
                <Download data-icon="inline-start" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 print:space-y-0">
        {serials.map((serial, index) => (
          <PaperForm
            key={serial}
            questionnaire={questionnaire}
            serial={serial}
            lang={language}
            enumerator={enumerator}
            newPage={index > 0}
          />
        ))}
      </div>
    </main>
  )
}
