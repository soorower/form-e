import {
  Calendar,
  ChevronDown,
  Columns3,
  CircleDot,
  Clock,
  FileText,
  ListOrdered,
  Hash,
  SquareCheck,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { QuestionType } from '#/lib/questionnaire/types'

export const QUESTION_ICONS: Record<QuestionType, LucideIcon> = {
  short_text: Type,
  long_text: FileText,
  number: Hash,
  date: Calendar,
  time: Clock,
  single_choice: CircleDot,
  multi_choice: SquareCheck,
  dropdown: ChevronDown,
  ranking: ListOrdered,
  table: Table2,
  choice_experiment: Columns3,
}
