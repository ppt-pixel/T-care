export function workspaceForRole(role) {
  return role === 'ADMIN' ? '/hq' : role === 'GARDENER' ? '/crew' : '/garden';
}
