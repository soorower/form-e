import { useEffect, useMemo } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeResponses } from '#/lib/convex/response-codec'
import { stripSystemFieldsAll } from '#/lib/convex/rows'
import type { SurveyResponse } from '#/lib/questionnaire/types'

/** Responses fetched per page: well inside Convex's read limit even with long answers. */
const PAGE_SIZE = 150

/**
 * Every response to one survey, in survey-number order, fetched page by page
 * (`responses.listBySurveyPage`) and kept live. `complete` turns true once
 * the last page is in; until then `responses` holds what has arrived, so a
 * download must wait for it or it would miss rows.
 */
export function useSurveyResponses(questionnaireId: string): {
  responses: SurveyResponse[] | undefined
  complete: boolean
} {
  const ready = useConvexReady()
  const { results, status, loadMore } = usePaginatedQuery(
    api.responses.listBySurveyPage,
    ready ? { questionnaireId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )

  // Keep asking until the last page is in.
  useEffect(() => {
    if (status === 'CanLoadMore') loadMore(PAGE_SIZE)
  }, [status, loadMore])

  const responses = useMemo(
    () =>
      status === 'LoadingFirstPage'
        ? undefined
        : decodeResponses(stripSystemFieldsAll<SurveyResponse>(results as never)),
    [results, status],
  )
  return { responses, complete: status === 'Exhausted' }
}
