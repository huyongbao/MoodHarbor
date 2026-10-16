/**
 * RBAC 权限标识与分组（权限矩阵见 PRD 七）。
 * 超级管理员：全部权限；运营人员：仅查看类 + 预警跟进。
 */
export const ALL_PERMISSIONS = [
  'dashboard:view',
  'users:view',
  'users:edit',
  'conversations:view',
  'alerts:view',
  'alerts:handle',
  'debug:multimodal',
  'debug:intervention',
  'debug:digital-human',
  'debug:resources',
  'debug:memories',
  'accounts:manage',
  'roles:manage'
]

export const PERMISSION_GROUPS = [
  { module: '数据看板', perms: [{ key: 'dashboard:view', label: '查看' }] },
  {
    module: '用户管理',
    perms: [
      { key: 'users:view', label: '查看' },
      { key: 'users:edit', label: '编辑/封禁' }
    ]
  },
  { module: '倾诉记录', perms: [{ key: 'conversations:view', label: '查看（脱敏）' }] },
  {
    module: '预警中心',
    perms: [
      { key: 'alerts:view', label: '查看' },
      { key: 'alerts:handle', label: '更新跟进状态' }
    ]
  },
  {
    module: '调试台',
    perms: [
      { key: 'debug:multimodal', label: '多模态感知调试' },
      { key: 'debug:intervention', label: '转介干预配置' },
      { key: 'debug:digital-human', label: '数字心理疏导师' },
      { key: 'debug:resources', label: '心理健康自助资源库' },
      { key: 'debug:memories', label: '用户记忆' }
    ]
  },
  {
    module: '系统管理',
    perms: [
      { key: 'accounts:manage', label: '后台账号管理' },
      { key: 'roles:manage', label: '角色权限分配' }
    ]
  }
]

/** 运营人员默认权限（PRD 七矩阵） */
export const OPERATOR_PERMISSIONS = [
  'dashboard:view',
  'users:view',
  'conversations:view',
  'alerts:view',
  'alerts:handle'
]
