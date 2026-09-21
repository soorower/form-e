import { Fragment } from 'react'
import { ClipboardList } from 'lucide-react'
import { insertAt, moveItem } from '#/lib/list'
import { createQuestion, duplicateQuestion } from '#/lib/questionnaire/factory'
import type { Question, QuestionType, Questionnaire } from '#/lib/questionnaire/types'
import { FormSettings } from './FormSettings'
import { InsertQuestion } from './InsertQuestion'
import { QuestionCard } from './QuestionCard'
import { QuestionPalette } from './QuestionPalette'
import { SortableItem, SortableList } from './SortableList'

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

  /** Places a new question at `index`, pushing the questions from there on down one. */
  const insertQuestion = (type: QuestionType, index: number) =>
    setQuestions((list) => insertAt(list, index, createQuestion(type)))

  const changeQuestion = (next: Question) =>
    setQuestions((list) => list.map((q) => (q.id === next.id ? next : q)))

  const removeQuestion = (id: string) =>
    setQuestions((list) => list.filter((q) => q.id !== id))

  const duplicate = (id: string) =>
    setQuestions((list) => {
      const index = list.findIndex((q) => q.id === id)
      return index === -1 ? list : insertAt(list, index + 1, duplicateQuestion(list[index]))
    })

  const move = (id: string, direction: -1 | 1) =>
    setQuestions((list) => {
      const from = list.findIndex((q) => q.id === id)
      return from === -1 ? list : moveItem(list, from, from + direction)
    })

  const moveTo = (from: number, to: number) => setQuestions((list) => moveItem(list, from, to))

  // Choice-experiment blocks plan their cards against the survey's target.
  const survey = {
    id: questionnaire.id,
    responseTarget: questionnaire.responseTarget,
    onResponseTargetChange: (responseTarget: number) =>
      onUpdate((current) => ({ ...current, responseTarget })),
  }

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
          <SortableList ids={questions.map((question) => question.id)} onMove={moveTo} className="space-y-2">
            <InsertQuestion
              label="Insert a question at the top"
              onInsert={(type) => insertQuestion(type, 0)}
            />
            {questions.map((question, index) => (
              <Fragment key={question.id}>
                <SortableItem id={question.id}>
                  {(handle, dragging) => (
                    <QuestionCard
                      question={question}
                      index={index}
                      total={questions.length}
                      languages={languages}
                      survey={survey}
                      handle={handle}
                      dragging={dragging}
                      onChange={changeQuestion}
                      onMove={(direction) => move(question.id, direction)}
                      onDuplicate={() => duplicate(question.id)}
                      onDelete={() => removeQuestion(question.id)}
                    />
                  )}
                </SortableItem>
                <InsertQuestion
                  label={`Insert a question after question ${index + 1}`}
                  onInsert={(type) => insertQuestion(type, index + 1)}
                />
              </Fragment>
            ))}
          </SortableList>
        )}
      </div>
    </div>
  )
}
