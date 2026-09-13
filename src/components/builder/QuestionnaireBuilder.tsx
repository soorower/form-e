import { ClipboardList } from 'lucide-react'
import { createQuestion, duplicateQuestion } from '#/lib/questionnaire/factory'
import type { Question, QuestionType, Questionnaire } from '#/lib/questionnaire/types'
import { FormSettings } from './FormSettings'
import { QuestionCard } from './QuestionCard'
import { QuestionPalette } from './QuestionPalette'

type Updater = (current: Questionnaire) => Questionnaire

interface QuestionnaireBuilderProps {
  questionnaire: Questionnaire
  onUpdate: (updater: Updater) => void
}

export function QuestionnaireBuilder({ questionnaire, onUpdate }: QuestionnaireBuilderProps) {
  const { languages, questions } = questionnaire

  const setQuestions = (mutate: (questions: Question[]) => Question[]) =>
    onUpdate((current) => ({ ...current, questions: mutate(current.questions) }))

  const addQuestion = (type: QuestionType) =>
    setQuestions((list) => [...list, createQuestion(type)])

  const changeQuestion = (next: Question) =>
    setQuestions((list) => list.map((q) => (q.id === next.id ? next : q)))

  const removeQuestion = (id: string) =>
    setQuestions((list) => list.filter((q) => q.id !== id))

  const duplicate = (id: string) =>
    setQuestions((list) => {
      const index = list.findIndex((q) => q.id === id)
      if (index === -1) return list
      const next = [...list]
      next.splice(index + 1, 0, duplicateQuestion(list[index]))
      return next
    })

  const move = (id: string, direction: -1 | 1) =>
    setQuestions((list) => {
      const from = list.findIndex((q) => q.id === id)
      const to = from + direction
      if (from === -1 || to < 0 || to >= list.length) return list
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <aside className="lg:sticky lg:top-24">
        <QuestionPalette onAdd={addQuestion} />
      </aside>

      <div className="space-y-5">
        <FormSettings
          questionnaire={questionnaire}
          onChange={(patch) => onUpdate((current) => ({ ...current, ...patch }))}
        />

        {questions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="font-medium">No questions yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Pick a question type from the list to start building your questionnaire.
            </p>
          </div>
        ) : (
          questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              languages={languages}
              onChange={changeQuestion}
              onMove={(direction) => move(question.id, direction)}
              onDuplicate={() => duplicate(question.id)}
              onDelete={() => removeQuestion(question.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
