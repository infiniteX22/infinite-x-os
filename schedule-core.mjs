const DAY = 86_400_000;

const iso = value => String(value || "").slice(0, 10);
const utc = value => {
  const parsed = new Date(`${iso(value)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const addDays = (value, days) => {
  const date = utc(value) || new Date();
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (start, finish) => {
  const a = utc(start), b = utc(finish);
  return a && b ? Math.round((b - a) / DAY) : 0;
};

const calendarConfig = options => ({workingDays:new Set(options?.workingDays?.length?options.workingDays:[1,2,3,4,5]),holidays:new Set(options?.holidays||[])});
const isWorkingDay = (value,calendar) => { const d=utc(value); return d&&calendar.workingDays.has(d.getUTCDay())&&!calendar.holidays.has(iso(value)); };
export const addWorkingDays = (value,days,options={}) => { const calendar=calendarConfig(options);let current=iso(value),remaining=Math.max(0,Number(days||0));while(!isWorkingDay(current,calendar))current=addDays(current,1);while(remaining>0){current=addDays(current,1);if(isWorkingDay(current,calendar))remaining--;}return current; };
export const workingDaysBetween = (start,finish,options={}) => { const calendar=calendarConfig(options);let current=iso(start),target=iso(finish),count=0;if(!current||!target||current>=target)return 0;while(current<target){current=addDays(current,1);if(isWorkingDay(current,calendar))count++;}return count; };

export const normalizeDependencies = dependencies => (Array.isArray(dependencies) ? dependencies : [])
  .map(entry => typeof entry === "string"
    ? { taskId: entry, type: "FS", lagDays: 0 }
    : { taskId: String(entry?.taskId || ""), type: ["FS", "SS", "FF", "SF"].includes(entry?.type) ? entry.type : "FS", lagDays: Number(entry?.lagDays || 0) })
  .filter(entry => entry.taskId);

export function validateDependencyGraph(tasks = []) {
  const ids = new Set(tasks.map(task => task.id));
  const incoming = new Map(tasks.map(task => [task.id, 0]));
  const outgoing = new Map(tasks.map(task => [task.id, []]));
  for (const task of tasks) for (const dependency of normalizeDependencies(task.dependencies)) {
    if (!ids.has(dependency.taskId)) return { ok: false, error: `Dependency task ${dependency.taskId} does not exist.` };
    if (dependency.taskId === task.id) return { ok: false, error: "A task cannot depend on itself." };
    incoming.set(task.id, incoming.get(task.id) + 1);
    outgoing.get(dependency.taskId).push(task.id);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id), order = [];
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const next of outgoing.get(id)) { incoming.set(next, incoming.get(next) - 1); if (incoming.get(next) === 0) queue.push(next); }
  }
  return order.length === tasks.length ? { ok: true, order } : { ok: false, error: "Circular task dependencies are not permitted." };
}

export function calculateCriticalPath(tasks = [], options = {}) {
  const graph = validateDependencyGraph(tasks);
  if (!graph.ok) return graph;
  const start = iso(options.projectStart) || iso(tasks.map(task => task.plannedStart).filter(Boolean).sort()[0]) || new Date().toISOString().slice(0, 10);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const schedule = new Map();
  for (const id of graph.order) {
    const task = byId.get(id), duration = task.isMilestone ? 0 : Math.max(1, Number(task.durationDays || (task.plannedStart && task.plannedFinish ? workingDaysBetween(task.plannedStart, task.plannedFinish,options.calendar) + 1 : 1)));
    let earliestStart = task.plannedStart ? Math.max(0, workingDaysBetween(start, task.plannedStart,options.calendar)) : 0;
    for (const dep of normalizeDependencies(task.dependencies)) {
      const predecessor = schedule.get(dep.taskId), lag = Number(dep.lagDays || 0);
      if (!predecessor) continue;
      const constraint = dep.type === "SS" ? predecessor.earliestStart + lag
        : dep.type === "FF" ? predecessor.earliestFinish + lag - duration
        : dep.type === "SF" ? predecessor.earliestStart + lag - duration
        : predecessor.earliestFinish + lag;
      earliestStart = Math.max(earliestStart, constraint);
    }
    schedule.set(id, { duration, earliestStart, earliestFinish: earliestStart + duration });
  }
  const projectDuration = Math.max(0, ...[...schedule.values()].map(item => item.earliestFinish));
  const successors = new Map(tasks.map(task => [task.id, []]));
  for (const task of tasks) for (const dep of normalizeDependencies(task.dependencies)) successors.get(dep.taskId).push({ ...dep, taskId: task.id });
  for (const id of [...graph.order].reverse()) {
    const item = schedule.get(id), next = successors.get(id);
    let latestFinish = projectDuration;
    if (next.length) latestFinish = Math.min(...next.map(edge => {
      const successor = schedule.get(edge.taskId), lag = Number(edge.lagDays || 0);
      if (edge.type === "SS") return successor.latestStart - lag + item.duration;
      if (edge.type === "FF") return successor.latestFinish - lag;
      if (edge.type === "SF") return successor.latestFinish - lag + item.duration;
      return successor.latestStart - lag;
    }));
    item.latestFinish = latestFinish;
    item.latestStart = latestFinish - item.duration;
    item.totalFloat = Math.max(0, item.latestStart - item.earliestStart);
    item.critical = item.totalFloat === 0;
  }
  return {
    ok: true,
    projectStart: start,
    forecastFinish: addWorkingDays(start, Math.max(0, projectDuration - 1),options.calendar),
    durationDays: projectDuration,
    tasks: graph.order.map(id => {
      const task = byId.get(id), item = schedule.get(id);
      return { id, plannedStart: addWorkingDays(start, item.earliestStart,options.calendar), plannedFinish: addWorkingDays(start, Math.max(item.earliestStart, item.earliestFinish - 1),options.calendar), ...item };
    })
  };
}
