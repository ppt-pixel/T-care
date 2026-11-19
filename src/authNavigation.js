export function workspaceForRole(role) {
  return role === 'ADMIN' ? '/hq' : role === 'GARDENER' ? '/crew' : '/garden';
}

export function usesWorkspaceSidebar(workspaceKey) {
  return ['garden', 'crew', 'hq'].includes(workspaceKey);
}
