/**
 * 按钮级权限指令：v-permission="'users:edit'"
 * 无权限时直接移除元素（PRD 七：超管/运营做按钮级控制）。
 */
import { useUserStore } from '@/stores/user'

export const permission = {
  mounted(el, binding) {
    const store = useUserStore()
    if (binding.value && !store.has(binding.value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
