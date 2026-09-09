import { assert, object, integer, id, policy, addDays, sourceChanged, ownResource, AppError } from '../domain/common.mjs';
import { fixtureEvent } from '../domain/events.mjs';
import { prepare, approve, exportRegistry, sent, reconcile, registryView } from '../domain/registry.mjs';
import { reserveCredit, resolveCredit } from '../domain/credits.mjs';
import { dashboard, programRead, shareRead, partnerRead, creditRead } from '../domain/projections.mjs';
import { createGrant, validGrant, authorize } from './access.mjs';

export function dispatch(state, actor, context, action, input, now) {
  switch (action) {
    case 'dashboard': object(input, []); return dashboard(state, actor);
    case 'program.read': object(input, []); return programRead(state, actor);
    case 'program.save': {
      const next = policy(input, state.policies.length + 1, state.clock); state.policies.push(next); if (state.mode === 'real') state.policyConfigured = [...new Set([...state.policyConfigured,input.kind])]; return next;
    }
    case 'enrollment.join': {
      object(input, ['consent'], ['consent']); assert(input.consent === true, 'CONSENT_REQUIRED', 400, 'Нужно добровольное согласие');
      let enrollment = state.enrollments.find(e => e.actorId === actor.id);
      if (!enrollment) {
        enrollment = { id: id(), actorId: actor.id, consent: true, joinedAt: state.clock,
          policyVersion: state.policies.findLast(p => p.kind === (actor.role === 'customer' ? 'credit' : 'cash')).version,
          referralUrl: `/r/${actor.id}`, branded: true };
        state.enrollments.push(enrollment);
      }
      return enrollment;
    }
    case 'share.read': object(input, []); return shareRead(state, actor);
    case 'partner.read': return partnerRead(state, actor, input);
    case 'credit.read': return creditRead(state, actor, input);
    case 'credit.reserve': return reserveCredit(state, actor, input);
    case 'credit.resolve': return resolveCredit(state, input, actor.id);
    case 'registry.prepare': return prepare(state, input, actor.id);
    case 'registry.read': object(input, ['artifactId'], ['artifactId']); return registryView(state, ownResource(state.registries, input.artifactId));
    case 'registry.approve': return approve(state, input, actor.id);
    case 'registry.export': return exportRegistry(state, input);
    case 'registry.sent': return sent(state, input, actor.id);
    case 'registry.reconcile': return reconcile(state, input, actor.id);
    case 'fixture.event': return fixtureEvent(state, input);
    case 'fixture.advance': {
      object(input, ['days'], ['days']); integer(input.days, 0, 365); const next = addDays(state.clock, input.days);
      if (next !== state.clock) { state.clock = next; sourceChanged(state); } return { clock: state.clock, sourceVersion: state.sourceVersion };
    }
    case 'grant.list': object(input,[]); return state.grants.filter(g=>g.actorId===actor.id);
    case 'task.list': object(input,[]); return state.tasks.filter(t=>t.actorId===actor.id).map(taskView);
    case 'grant.create': return createGrant(state, actor, input, now);
    case 'grant.revoke': {
      object(input, ['grantId'], ['grantId']); const grant = ownResource(state.grants, input.grantId);
      assert(grant.actorId === actor.id, 'FORBIDDEN', 403);
      grant.revokedAt ??= state.clock; return { grantId: grant.id, revokedAt: grant.revokedAt };
    }
    case 'task.create': {
      object(input, ['kind', 'input'], ['kind', 'input']); object(input.input, input.kind === 'registry' ? ['period', 'artifactId'] : input.kind === 'partner' ? ['partnerId'] : ['customerId']);
      const taskAction = { registry: 'registry.prepare', partner: 'partner.read', credit: 'credit.read' }[input.kind];
      assert(taskAction); authorize(state, actor, context, taskAction, input.input, now);
      assert(state.tasks.length < 200, 'DEMO_LIMIT', 429);
      const task = { id: id(), actorId: actor.id, grantId: context.grantId, kind: input.kind, input: input.input,
        action: taskAction, state: 'pending', result: null, createdAt: state.clock, usage: null, runner: state.mode === 'real' ? 'n3_application' : 'deterministic_fixture' };
      state.tasks.push(task); return { taskId: task.id, ...task };
    }
    case 'task.read': object(input, ['taskId'], ['taskId']); return taskView(ownResource(state.tasks, input.taskId));
    case 'task.cancel': {
      object(input, ['taskId'], ['taskId']); const task = ownResource(state.tasks, input.taskId);
      if (!['completed', 'failed', 'canceled'].includes(task.state)) { task.state = 'canceled'; task.canceledAt = state.clock; }
      return taskView(task);
    }
    case 'task.run': {
      object(input, ['taskId'], ['taskId']); const task = ownResource(state.tasks, input.taskId);
      validGrant(state, actor, task.grantId, now);
      if (['completed', 'failed', 'canceled'].includes(task.state)) return taskView(task);
      authorize(state, actor, context, task.action, task.input, now);
      const checkpoint = structuredClone(state);
      let result;
      try { result = dispatch(state, actor, context, task.action, task.input, now); }
      catch (error) {
        if (!(error instanceof AppError) || ![400, 409].includes(error.status)) throw error;
        Object.assign(state, checkpoint);
        const failed = ownResource(state.tasks, input.taskId);
        failed.state = 'failed'; failed.error = { code: error.code, message: error.message }; failed.completedAt = state.clock;
        return taskView(failed);
      }
      validGrant(state, actor, task.grantId, now);
      task.state = 'completed'; task.completedAt = state.clock; task.result = result;
      return taskView(task);
    }
  }
}
function taskView(task) { return { taskId: task.id, ...task }; }
