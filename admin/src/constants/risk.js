/**
 * 风险等级与预警状态机常量（对齐 PRD 8.4 / 9.3）。
 * riskLevel：1 最高危（红）、4 最低（蓝）。
 */
export const RISK_LEVELS = {
  1: { label: '一级（红）', type: 'danger' },
  2: { label: '二级（橙）', type: 'warning' },
  3: { label: '三级（黄）', type: 'primary' },
  4: { label: '四级（蓝）', type: 'info' }
}

export const INTERVENTION_TYPES = {
  emergency: { label: '紧急转介', type: 'danger' },
  hotline: { label: '热线推荐', type: 'warning' },
  normal: { label: '正常回应', type: 'info' }
}

export const ALERT_STATUS = {
  pending: { label: '待跟进', type: 'danger' },
  processing: { label: '跟进中', type: 'warning' },
  resolved: { label: '已解决', type: 'success' },
  false_alarm: { label: '误报', type: 'info' }
}

/** RiskAlert 状态机：仅允许以下流转，非法流转后端返回 code 400 */
export const ALERT_TRANSITIONS = {
  pending: ['processing', 'false_alarm'],
  processing: ['resolved', 'false_alarm'],
  resolved: [],
  false_alarm: []
}
