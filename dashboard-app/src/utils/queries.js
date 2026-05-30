import { Q } from 'cozy-client'
import { TODOS_DOCTYPE } from 'src/doctypes/todos'
import { TRANSCRIPTIONS_DOCTYPE } from 'src/doctypes/transcriptions'

export const getAllTodos = {
  definition: () => Q(TODOS_DOCTYPE),
  options: {
    as: `todos`
  }
}

export const getAllTranscriptions = {
  definition: () => Q(TRANSCRIPTIONS_DOCTYPE),
  options: {
    as: `transcriptions`
  }
}
