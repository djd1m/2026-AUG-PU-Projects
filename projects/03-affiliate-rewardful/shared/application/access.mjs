import { assert, str, object, integer, id, ownResource } from '../domain/common.mjs';
import { ownTarget } from '../domain/projections.mjs';

export const grantsAllowed = {
  merchant: ['dashboard', 'program.read', 'registry.prepare', 'registry.read'],
  partner: ['program.read', 'partner.read', 'share.read'], customer: ['program.read', 'credit.read', 'share.read'],
};
const direct = {
  merchant: ['dashboard', 'program.read', 'program.save', 'registry.prepare', 'registry.read', 'registry.approve', 'registry.export', 'registry.sent', 'registry.reconcile', 'credit.resolve', 'fixture.event', 'fixture.advance'],
  partner: ['program.read', 'partner.read', 'enrollment.join', 'share.read'],
  customer: ['program.read', 'credit.read', 'credit.reserve', 'enrollment.join', 'share.read'],
};
export const readActions = new Set(['dashboard', 'program.read', 'share.read', 'partner.read', 'credit.read', 'registry.read', 'task.read']);
export const actions = new Set([...Object.values(direct).flat(), 'grant.create', 'grant.revoke', 'task.create', 'task.run', 'task.read', 'task.cancel']);
export function validGrant(state, actor, grantId, now) {
  const grant = ownResource(state.grants, grantId);
  assert(grant.actorId === actor.id && !grant.revokedAt && Date.parse(grant.expiresAt) > now && grant.demoExpiresAt > state.clock,
    'GRANT_INACTIVE', 403, 'Полномочия отозваны или истекли');
  return grant;
}
export function authorize(state, actor, context, action, input, now) {
  assert(!(state.mode === 'real' && action.startsWith('fixture.')), 'FIXTURE_DISABLED', 403, 'Синтетические события недоступны в реальной организации');
  assert(actions.has(action), 'UNKNOWN_ACTION', 400, 'Неизвестная операция');
  if (action === 'task.create') {
    const underlying = {registry:'registry.prepare',partner:'partner.read',credit:'credit.read'}[input?.kind];
    assert(underlying); authorize(state,actor,context,underlying,input.input ?? {},now);
  }
  const taskAction = action.startsWith('task.');
  const grantManagement = action.startsWith('grant.');
  assert(direct[actor.role]?.includes(action) || taskAction || grantManagement, 'FORBIDDEN', 403, 'Операция недоступна в этом контексте');
  if (action === 'partner.read') ownTarget(actor, input, 'partnerId');
  if (action === 'credit.read') ownTarget(actor, input, 'customerId');
  if (context.grantId) {
    str(context.grantId);
    const grant = validGrant(state, actor, context.grantId, now);
    assert(!grantManagement && (taskAction || grant.actions.includes(action)), 'GRANT_SCOPE', 403, 'Операция не включена в делегацию');
    if (grant.artifactId && !taskAction) assert(input.artifactId === grant.artifactId, 'GRANT_SCOPE', 403);
  } else assert(!['task.create', 'task.run'].includes(action), 'GRANT_REQUIRED', 403, 'Нужна действующая делегация');
  if (taskAction && action !== 'task.create') {
    const task = ownResource(state.tasks, input.taskId);
    assert(task.actorId === actor.id && (!context.grantId || task.grantId === context.grantId), 'FORBIDDEN', 403, 'Задача недоступна');
  }
}
export function createGrant(state, actor, input, now) {
  object(input, ['actions', 'expiresInSeconds', 'artifactId'], ['actions', 'expiresInSeconds']);
  assert(Array.isArray(input.actions) && input.actions.length > 0 && input.actions.length <= 10);
  assert(input.actions.every(a => grantsAllowed[actor.role].includes(a)), 'GRANT_SCOPE', 403, 'Запрошены избыточные полномочия');
  integer(input.expiresInSeconds, 1, 3600);
  if (Object.hasOwn(input, 'artifactId')) str(input.artifactId);
  if (input.artifactId) { str(input.artifactId); assert(actor.role === 'merchant', 'GRANT_SCOPE', 403); ownResource(state.registries, input.artifactId); }
  assert(state.grants.length < 100, 'DEMO_LIMIT', 429);
  const grant = { id: id(), actorId: actor.id, role: actor.role, actions: [...new Set(input.actions)],
    artifactId: input.artifactId ?? null, expiresAt: new Date(now + input.expiresInSeconds * 1000).toISOString(),
    demoExpiresAt: new Date(Date.parse(state.clock) + input.expiresInSeconds * 1000).toISOString(), createdAt: state.clock, revokedAt: null };
  state.grants.push(grant);
  return { grantId: grant.id, ...grant, scope: { actorId: actor.id, actions: grant.actions, artifactId: grant.artifactId } };
}
