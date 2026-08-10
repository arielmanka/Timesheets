import { ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { ApiError } from '../types/common'

/**
 * Wraps an async store/service call with a loading flag and a toast on
 * failure, so views don't each hand-roll try/loading/catch boilerplate.
 */
export function useAsyncAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const loading = ref(false)
  const ui = useUiStore()

  async function run(...args: Args): Promise<R | undefined> {
    loading.value = true
    try {
      return await fn(...args)
    } catch (err) {
      ui.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
