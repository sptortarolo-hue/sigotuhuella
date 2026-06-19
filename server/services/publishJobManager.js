import crypto from 'crypto';

const jobs = new Map();

export function createJob(petId) {
  const id = crypto.randomUUID();
  jobs.set(id, { petId, status: 'running', result: null, error: null, createdAt: Date.now() });
  return id;
}

export function startJob(publishId, asyncFn) {
  const job = jobs.get(publishId);
  if (!job) return;
  (async () => {
    try {
      const result = await asyncFn();
      const j = jobs.get(publishId);
      if (j) { j.status = 'completed'; j.result = result; }
    } catch (err) {
      const j = jobs.get(publishId);
      if (j) { j.status = 'failed'; j.error = err.message || String(err); }
    }
  })();
  setTimeout(() => jobs.delete(publishId), 600000);
}

export function getJob(publishId) {
  const j = jobs.get(publishId);
  if (!j) return null;
  return { publishId, petId: j.petId, status: j.status, result: j.result, error: j.error, createdAt: j.createdAt };
}
