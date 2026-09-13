/**
 * Convex returns each document with `_id` and `_creationTime` attached. Those
 * fields are not part of the app's own types and the mutation validators
 * reject them, so anything read from a query is stripped here before it is
 * used as app data or sent back in a mutation.
 */

type SystemFields = { _id?: unknown; _creationTime?: unknown }

export function stripSystemFields<T>(row: (T & SystemFields) | null | undefined): T | null | undefined {
  if (row === null || row === undefined) return row as null | undefined
  const { _id, _creationTime, ...rest } = row
  void _id
  void _creationTime
  return rest as T
}

export function stripSystemFieldsAll<T>(rows: (T & SystemFields)[] | undefined): T[] | undefined {
  return rows?.map((row) => stripSystemFields(row) as T)
}
