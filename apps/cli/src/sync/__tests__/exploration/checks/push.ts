import type { TModel } from "../model.ts";
import type { push } from "../../../engine.ts";

const DEL = "\0DEL";

interface IObservation {
  d: number;
  now: string | undefined;
  head: string | undefined;
  local: (string | undefined)[];
  records: number;
  reports: string[];
  result: Awaited<ReturnType<typeof push>> | undefined;
}

export function checkPush(model: TModel, observation: IObservation) {
  const { now, head, d } = observation;
  checkIntent(model, observation);
  checkAncestor(model, observation);

  if (now !== head) {
    checkCommit(model, observation);
    model.commits.push(now);
    model.authors.push(d);
    if (now === undefined) model.state.tombstoned = true;
    if ((now ?? DEL) === model.last[d] || !model.dirty[d]) model.clean(d);
    checkPlacement(model, observation);
  } else checkUnchanged(model, observation);

  model.seen[d] = model.commits.length - 1;
}

function checkIntent(model: TModel, observation: IObservation) {
  const { d, records, local } = observation;
  const desired = model.last[d] === DEL ? undefined : model.last[d];

  if (model.dirty[d] && records === 0 && !local.includes(desired))
    model.bad("I7-push-undid-action", "Most recent explicit action disappeared without conflict");
}

function checkCommit(model: TModel, observation: IObservation) {
  const { d, now } = observation;

  if (!model.dirty[d] || !model.pending[d]!.has(now ?? DEL))
    model.bad(
      now === undefined ? "I5-tombstone" : "I1-unintended-push",
      "Commit has no user intent",
    );

  checkLatest(model, observation);
}

function checkLatest(model: TModel, observation: IObservation) {
  const { d, now } = observation;

  if (
    model.pending[d]!.has(now ?? DEL) &&
    (now ?? DEL) !== model.last[d] &&
    model.w.targets[d]!.length === 1
  )
    model.bad("I1-discarded-value-pushed", "An earlier discarded edit was pushed");
}

function checkPlacement(model: TModel, observation: IObservation) {
  const { now, local, result, reports } = observation;

  if (
    !result ||
    result.conflicts ||
    reports.some((report) => report.includes("checkout needs approval"))
  )
    return;

  if (local.some((value) => value !== now))
    model.bad("P2-push-local-differs", "Approved places differ after successful push");
}

function checkUnchanged(model: TModel, observation: IObservation) {
  const { d, now, local, records, result } = observation;
  if (!result || result.conflicts || records) return;
  checkHeldIntent(model, observation);
  if (local.every((value) => value === now)) model.clean(d);
}

function checkHeldIntent(model: TModel, observation: IObservation) {
  const { d, now, local, reports } = observation;
  if (reports.some((message) => message.startsWith("Held back"))) return;

  if (model.dirty[d] && (model.last[d] === DEL ? undefined : model.last[d]) !== now)
    model.bad("P1-push-dropped-user-op", "Push dropped explicit intent");
  else if (!model.dirty[d] && local.some((value) => value !== now))
    model.bad("I2-push-not-converged", "Clean device differs from server");
}

function checkAncestor(model: TModel, observation: IObservation) {
  const { d, now, head } = observation;
  if (now === head || !model.commits.includes(now)) return;
  if (head === model.commits[model.intentSeen[d]!]) return;

  const unseen = model.authors.some(
    (author, index) => author !== d && author !== -1 && index > model.intentSeen[d]!,
  );

  if (unseen)
    model.bad(
      "I1-ancestor-without-observation",
      "Replaced a newer unseen commit with ancestor bytes",
    );
}
