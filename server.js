import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3000);
const clickUpToken = process.env.CLICKUP_API_TOKEN;
const listId = process.env.CLICKUP_LIST_ID;
const reportPassword = process.env.REPORT_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;

if (!clickUpToken || !listId || !reportPassword || !sessionSecret) {
  throw new Error('Missing CLICKUP_API_TOKEN, CLICKUP_LIST_ID, REPORT_PASSWORD, or SESSION_SECRET');
}
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(express.json({ limit: '16kb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}
function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function validSession(value) {
  if (!value || !value.includes('.')) return false;
  const [payload, signature] = value.split('.');
  if (!safeEqual(signature, sign(payload))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}
function requireAuth(req, res, next) {
  if (!validSession(req.headers.cookie?.match(/(?:^|; )report_session=([^;]+)/)?.[1])) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'dependencias-live-report' }));

app.post('/auth/login', loginLimiter, (req, res) => {
  if (!safeEqual(req.body?.password || '', reportPassword)) return res.status(401).json({ error: 'Invalid password' });
  res.setHeader('Set-Cookie', `report_session=${createSession()}; ${cookieOptions()}`);
  res.json({ ok: true });
});
app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'report_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.status(204).end();
});
app.get('/auth/me', (req, res) => res.json({ authenticated: validSession(req.headers.cookie?.match(/(?:^|; )report_session=([^;]+)/)?.[1]) }));

async function clickUp(path) {
  const response = await fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: clickUpToken, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`ClickUp returned ${response.status}`);
  return response.json();
}
function normalizeTask(task) {
  return {
    id: task.id,
    name: task.name,
    url: task.url || `https://app.clickup.com/t/${task.id}`,
    status: task.status?.status || 'Unknown',
    statusType: task.status?.type || 'open',
    priority: task.priority?.priority || null,
    dueDate: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
    startDate: task.start_date ? new Date(Number(task.start_date)).toISOString() : null,
    parent: task.parent || null,
    assignees: (task.assignees || []).map(a => a.username || a.email || a.id),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : []
  };
}
app.get('/api/report', requireAuth, async (req, res) => {
  try {
    const [list, taskData] = await Promise.all([
      clickUp(`/list/${encodeURIComponent(listId)}`),
      clickUp(`/list/${encodeURIComponent(listId)}/task?subtasks=true&include_closed=false&include_timl=true&include_location=true`)
    ]);
    const tasks = (taskData.tasks || []).map(normalizeTask);
    const byId = new Map(tasks.map(t => [t.id, t]));
    const dependencies = [];
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        const blockedId = dep.task_id || task.id;
        const blockerId = dep.depends_on;
        if (!blockerId || !blockedId || blockerId === blockedId) continue;
        dependencies.push({
          blockerId,
          blockedId,
          type: 'blocks',
          blocker: byId.get(blockerId) || null,
          blocked: byId.get(blockedId) || null
        });
      }
    }
    const unique = [...new Map(dependencies.map(d => [`${d.blockerId}:${d.blockedId}`, d])).values()];
    res.set({ 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' });
    res.json({
      generatedAt: new Date().toISOString(),
      list: { id: list.id, name: list.name, url: `https://app.clickup.com/${list.id}` },
      tasks: tasks.map(({ dependencies: _dependencies, ...task }) => task),
      dependencies: unique,
      source: 'clickup-api'
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: 'Could not read live ClickUp data' });
  }
});

app.use(express.static('public', { etag: false, maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(process.cwd() + '/public/index.html'));
app.listen(port, () => console.log(`Live report listening on :${port}`));
