// Commercial entitlement enforcement: resolves the billing scope (organization
// first, legacy user second), lazily materializes per-period usage rows, and
// atomically reserves/consumes/releases optimization credits (1 credit = 1 URL
// + 1 viewport). All mutations are single-statement conditional UPDATEs so
// they stay atomic on D1 without batch().
import { PLAN_CONTRACT, type PlanContract, type PlanId } from '@wpinstant/shared';
import type { Env } from '../types/env.js';

export interface BillingScope {
  organizationId: string | null;
  userId: string | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  plan_id: string;
  status: string;
  max_sites: number;
  billing_interval: 'monthly' | 'annual';
  current_period_start: number | null;
  current_period_end: number | null;
  overage_enabled: number;
  overage_limit_credits: number;
}

interface UsagePeriodRow {
  id: string;
  subscription_id: string;
  period_start: number;
  period_end: number;
  credit_limit: number;
  credits_reserved: number;
  credits_used: number;
  pageview_limit: number;
  pageviews_used: number;
  byte_limit: number;
  bytes_used: number;
  overage_enabled: number;
  overage_limit_credits: number;
  overage_credits_reserved: number;
  overage_credits_used: number;
}

export type ReservationOutcome =
  | { ok: true; reservationId: string; isOverage: boolean; period: UsagePeriodRow }
  | { ok: false; code: 'CREDITS_EXHAUSTED'; inPlanRemaining: number; overageRemaining: number; overageEnabled: boolean };

const INTERVAL_SECONDS: Record<'monthly' | 'annual', number> = {
  monthly: 30 * 86400,
  annual: 365 * 86400,
};

export function resolveBillingScope(vars: { organizationId?: string; userId?: string }): BillingScope {
  return {
    organizationId: vars.organizationId ?? null,
    userId: vars.userId ?? null,
  };
}

function planFor(subscription: SubscriptionRow): PlanContract {
  const contract = PLAN_CONTRACT[subscription.plan_id as PlanId];
  if (contract) return contract;
  return PLAN_CONTRACT.starter;
}

export async function loadSubscriptionForScope(
  env: Env,
  scope: BillingScope
): Promise<{ subscription: SubscriptionRow; plan: PlanContract } | null> {
  const statuses = "('active','trialing')";
  const row = scope.organizationId
    ? await env.DB.prepare(
        `SELECT * FROM subscriptions WHERE organization_id = ? AND status IN ${statuses}
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, current_period_end DESC LIMIT 1`
      )
        .bind(scope.organizationId)
        .first<SubscriptionRow>()
    : await env.DB.prepare(
        `SELECT * FROM subscriptions WHERE user_id = ? AND status IN ${statuses}
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, current_period_end DESC LIMIT 1`
      )
        .bind(scope.userId as string)
        .first<SubscriptionRow>();
  if (!row) return null;
  return { subscription: row, plan: planFor(row) };
}

function derivePeriodBounds(subscription: SubscriptionRow, now: number): { start: number; end: number } {
  const intervalSec = INTERVAL_SECONDS[subscription.billing_interval] ?? INTERVAL_SECONDS.monthly;
  const end = subscription.current_period_end && subscription.current_period_end > now
    ? subscription.current_period_end
    : now + intervalSec;
  if (subscription.current_period_start && subscription.current_period_start <= now) {
    return { start: subscription.current_period_start, end };
  }
  return { start: end - intervalSec, end };
}

export async function getOrCreateUsagePeriod(env: Env, subscription: SubscriptionRow): Promise<UsagePeriodRow> {
  const now = Math.floor(Date.now() / 1000);
  const plan = planFor(subscription);
  const { start, end } = derivePeriodBounds(subscription, now);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO usage_periods
       (id, subscription_id, organization_id, user_id, period_start, period_end,
        credit_limit, pageview_limit, byte_limit, overage_enabled, overage_limit_credits, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      `usage_${subscription.id}_${start}`,
      subscription.id,
      subscription.organization_id,
      subscription.user_id,
      start,
      end,
      plan.monthlyCredits,
      plan.monthlyPageviews,
      plan.monthlyBytes,
      subscription.overage_enabled ? 1 : 0,
      subscription.overage_limit_credits,
      now,
      now
    )
    .run();
  const period = await env.DB.prepare('SELECT * FROM usage_periods WHERE subscription_id = ? AND period_start = ?')
    .bind(subscription.id, start)
    .first<UsagePeriodRow>();
  if (!period) throw new Error('usage period missing after ensure');
  return period;
}

async function decrementReserved(env: Env, periodId: string, units: number, isOverage: boolean): Promise<void> {
  if (isOverage) {
    await env.DB.prepare(
      'UPDATE usage_periods SET overage_credits_reserved = overage_credits_reserved - ?, updated_at = ? WHERE id = ?'
    )
      .bind(units, Math.floor(Date.now() / 1000), periodId)
      .run();
  } else {
    await env.DB.prepare(
      'UPDATE usage_periods SET credits_reserved = credits_reserved - ?, updated_at = ? WHERE id = ?'
    )
      .bind(units, Math.floor(Date.now() / 1000), periodId)
      .run();
  }
}

export async function reserveCredits(
  env: Env,
  subscription: SubscriptionRow,
  params: {
    units: number;
    runKey: string;
    jobId?: string;
    source?: 'manual' | 'crawl' | 'rerun' | 'connect';
  }
): Promise<ReservationOutcome> {
  if (params.units <= 0) throw new Error('credit units must be positive');
  const period = await getOrCreateUsagePeriod(env, subscription);

  const existing = await env.DB.prepare(
    'SELECT * FROM optimization_credit_reservations WHERE run_key = ?'
  )
    .bind(params.runKey)
    .first<{ id: string; is_overage: number; state: string }>();
  if (existing && existing.state !== 'released') {
    return { ok: true, reservationId: existing.id, isOverage: existing.is_overage === 1, period };
  }

  const now = Math.floor(Date.now() / 1000);
  let isOverage = false;
  const inPlan = await env.DB.prepare(
    `UPDATE usage_periods SET credits_reserved = credits_reserved + ?, updated_at = ?
     WHERE id = ? AND credits_used + credits_reserved + ? <= credit_limit`
  )
    .bind(params.units, now, period.id, params.units)
    .run();
  if (inPlan.meta.changes === 1) {
    isOverage = false;
  } else if (period.overage_enabled === 1) {
    const overage = await env.DB.prepare(
      `UPDATE usage_periods SET overage_credits_reserved = overage_credits_reserved + ?, updated_at = ?
       WHERE id = ? AND overage_enabled = 1 AND overage_credits_used + overage_credits_reserved + ? <= overage_limit_credits`
    )
      .bind(params.units, now, period.id, params.units)
      .run();
    if (overage.meta.changes !== 1) {
      return exhausted(period);
    }
    isOverage = true;
  } else {
    return exhausted(period);
  }

  const reservationId = `cr_${params.runKey}`;
  try {
    await env.DB.prepare(
      `INSERT INTO optimization_credit_reservations
         (id, run_key, job_id, subscription_id, usage_period_id, units, is_overage, state, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`
    )
      .bind(
        reservationId,
        params.runKey,
        params.jobId ?? null,
        subscription.id,
        period.id,
        params.units,
        isOverage ? 1 : 0,
        params.source ?? 'manual',
        now,
        now
      )
      .run();
  } catch {
    await decrementReserved(env, period.id, params.units, isOverage);
    const raced = await env.DB.prepare('SELECT * FROM optimization_credit_reservations WHERE run_key = ?')
      .bind(params.runKey)
      .first<{ id: string; is_overage: number; state: string }>();
    if (raced && raced.state !== 'released') {
      return { ok: true, reservationId: raced.id, isOverage: raced.is_overage === 1, period };
    }
    return exhausted(period);
  }
  return { ok: true, reservationId, isOverage, period };
}

function exhausted(period: UsagePeriodRow): ReservationOutcome {
  return {
    ok: false,
    code: 'CREDITS_EXHAUSTED',
    inPlanRemaining: Math.max(0, period.credit_limit - period.credits_reserved),
    overageRemaining: period.overage_enabled === 1
      ? Math.max(0, period.overage_limit_credits - period.overage_credits_reserved)
      : 0,
    overageEnabled: period.overage_enabled === 1,
  };
}

export async function consumeReservationForJob(
  env: Env,
  jobId: string
): Promise<{ reservationId: string; periodId: string; units: number; isOverage: boolean } | null> {
  const reservation = await env.DB.prepare(
    "SELECT * FROM optimization_credit_reservations WHERE job_id = ? AND state = 'reserved'"
  )
    .bind(jobId)
    .first<{ id: string; usage_period_id: string; units: number; is_overage: number }>();
  if (!reservation) return null;
  const flipped = await env.DB.prepare(
    "UPDATE optimization_credit_reservations SET state = 'consumed', updated_at = ? WHERE id = ? AND state = 'reserved'"
  )
    .bind(Math.floor(Date.now() / 1000), reservation.id)
    .run();
  if (flipped.meta.changes !== 1) return null;
  const now = Math.floor(Date.now() / 1000);
  if (reservation.is_overage === 1) {
    await env.DB.prepare(
      `UPDATE usage_periods SET overage_credits_reserved = overage_credits_reserved - ?,
         overage_credits_used = overage_credits_used + ?, updated_at = ? WHERE id = ?`
    )
      .bind(reservation.units, reservation.units, now, reservation.usage_period_id)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE usage_periods SET credits_reserved = credits_reserved - ?,
         credits_used = credits_used + ?, updated_at = ? WHERE id = ?`
    )
      .bind(reservation.units, reservation.units, now, reservation.usage_period_id)
      .run();
  }
  return {
    reservationId: reservation.id,
    periodId: reservation.usage_period_id,
    units: reservation.units,
    isOverage: reservation.is_overage === 1,
  };
}

export async function releaseReservationForJob(env: Env, jobId: string): Promise<void> {
  const reservation = await env.DB.prepare(
    "SELECT * FROM optimization_credit_reservations WHERE job_id = ? AND state IN ('reserved','pending')"
  )
    .bind(jobId)
    .first<{ id: string; usage_period_id: string; units: number; is_overage: number }>();
  if (!reservation) return;
  const flipped = await env.DB.prepare(
    "UPDATE optimization_credit_reservations SET state = 'released', updated_at = ? WHERE id = ? AND state IN ('reserved','pending')"
  )
    .bind(Math.floor(Date.now() / 1000), reservation.id)
    .run();
  if (flipped.meta.changes !== 1) return;
  await decrementReserved(env, reservation.usage_period_id, reservation.units, reservation.is_overage === 1);
}

export async function loadSubscriptionForSite(
  env: Env,
  siteId: string
): Promise<{ subscription: SubscriptionRow; plan: PlanContract } | null> {
  const site = await env.DB.prepare(
    'SELECT subscription_id, user_id FROM sites WHERE id = ? AND is_active = 1'
  )
    .bind(siteId)
    .first<{ subscription_id: string | null; user_id: string }>();
  if (!site) return null;
  let subscription: SubscriptionRow | null = null;
  if (site.subscription_id) {
    subscription = await env.DB.prepare(
      "SELECT * FROM subscriptions WHERE id = ? AND status IN ('active','trialing')"
    )
      .bind(site.subscription_id)
      .first<SubscriptionRow>();
  }
  if (!subscription) {
    subscription = await env.DB.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing') ORDER BY current_period_end DESC LIMIT 1"
    )
      .bind(site.user_id)
      .first<SubscriptionRow>();
  }
  if (!subscription) return null;
  return { subscription, plan: planFor(subscription) };
}

export async function countActiveFleetJobs(env: Env, subscriptionId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM optimization_jobs j
     JOIN sites s ON j.site_id = s.id
     WHERE s.subscription_id = ? AND j.status IN ('queued','processing')`
  )
    .bind(subscriptionId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordTrafficUsage(
  env: Env,
  subscription: SubscriptionRow,
  pageviews: number,
  bytes: number
): Promise<void> {
  if (pageviews <= 0 && bytes <= 0) return;
  const period = await getOrCreateUsagePeriod(env, subscription);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE usage_periods SET pageviews_used = pageviews_used + ?, bytes_used = bytes_used + ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(Math.max(0, Math.floor(pageviews)), Math.max(0, Math.floor(bytes)), now, period.id)
    .run();
}

export async function getUsageSnapshot(
  env: Env,
  subscription: SubscriptionRow
): Promise<UsagePeriodRow> {
  return getOrCreateUsagePeriod(env, subscription);
}

export type { SubscriptionRow, UsagePeriodRow };
