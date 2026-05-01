const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'subscriptions.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    userId TEXT PRIMARY KEY,
    stripeCustomerId TEXT,
    status TEXT,
    plan TEXT,
    currentPeriodEnd INTEGER,
    updatedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_customer ON subscriptions(stripeCustomerId);
`);

const upsertStmt = db.prepare(`
  INSERT INTO subscriptions (userId, stripeCustomerId, status, plan, currentPeriodEnd, updatedAt)
  VALUES (@userId, @stripeCustomerId, @status, @plan, @currentPeriodEnd, @updatedAt)
  ON CONFLICT(userId) DO UPDATE SET
    stripeCustomerId = COALESCE(excluded.stripeCustomerId, subscriptions.stripeCustomerId),
    status = excluded.status,
    plan = COALESCE(excluded.plan, subscriptions.plan),
    currentPeriodEnd = COALESCE(excluded.currentPeriodEnd, subscriptions.currentPeriodEnd),
    updatedAt = excluded.updatedAt
`);

const getByUserStmt = db.prepare('SELECT * FROM subscriptions WHERE userId = ?');
const getByCustomerStmt = db.prepare('SELECT * FROM subscriptions WHERE stripeCustomerId = ?');

module.exports = {
  upsertSubscription(data) {
    upsertStmt.run({
      userId: data.userId,
      stripeCustomerId: data.stripeCustomerId ?? null,
      status: data.status ?? null,
      plan: data.plan ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      updatedAt: Date.now(),
    });
  },
  getSubscription(userId) {
    if (!userId) return null;
    return getByUserStmt.get(userId) ?? null;
  },
  getSubscriptionByCustomer(stripeCustomerId) {
    if (!stripeCustomerId) return null;
    return getByCustomerStmt.get(stripeCustomerId) ?? null;
  },
};
