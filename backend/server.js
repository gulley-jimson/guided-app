require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const Stripe = require('stripe');
const { verifyToken } = require('@clerk/backend');
const Anthropic = require('@anthropic-ai/sdk');

const db = require('./db');

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CHECKOUT_SUCCESS_URL = process.env.CHECKOUT_SUCCESS_URL ?? 'https://guided.build/checkout-success';
const CHECKOUT_CANCEL_URL = process.env.CHECKOUT_CANCEL_URL ?? 'https://guided.build/checkout-cancel';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Replace the JSON parser so we keep the raw body — Stripe needs it for signature verification.
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  req.rawBody = body;
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// ---------- helpers ----------

async function verifyClerkToken(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Missing token');
    err.statusCode = 401;
    throw err;
  }
  if (!process.env.CLERK_SECRET_KEY) {
    const err = new Error('Server misconfigured: CLERK_SECRET_KEY not set');
    err.statusCode = 500;
    throw err;
  }
  const claims = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
  if (!claims?.sub) {
    const err = new Error('Invalid token');
    err.statusCode = 401;
    throw err;
  }
  return claims.sub;
}

function planFromPriceId(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_YEARLY) return 'yearly';
  if (priceId === process.env.STRIPE_PRICE_MONTHLY) return 'monthly';
  return null;
}

function isActiveStatus(status) {
  return status === 'active' || status === 'trialing';
}

function safeMs(seconds) {
  return typeof seconds === 'number' ? seconds * 1000 : null;
}

// ---------- routes ----------

fastify.get('/health', async () => ({ ok: true }));

fastify.post('/auth/verify', async (req, reply) => {
  try {
    const userId = await verifyClerkToken(req.body?.token);
    const sub = db.getSubscription(userId);
    if (!sub || !isActiveStatus(sub.status)) {
      return { valid: true, plan: null };
    }
    return { valid: true, plan: sub.plan ?? null };
  } catch (err) {
    return reply.code(err.statusCode ?? 401).send({ valid: false, error: err.message });
  }
});

fastify.post('/checkout', async (req, reply) => {
  if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
  try {
    const { token, plan } = req.body ?? {};
    const userId = await verifyClerkToken(token);

    const planChoice = plan === 'yearly' ? 'yearly' : 'monthly';
    const priceId = planChoice === 'yearly'
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return reply.code(500).send({ error: `Stripe price ID not configured for plan: ${planChoice}` });
    }

    // Reuse a Stripe customer if we already have one for this user.
    let customerId = db.getSubscription(userId)?.stripeCustomerId ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer: customerId,
      metadata: { clerkUserId: userId, plan: planChoice },
      subscription_data: {
        metadata: { clerkUserId: userId, plan: planChoice },
      },
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
      allow_promotion_codes: true,
    });

    return { url: session.url, id: session.id };
  } catch (err) {
    fastify.log.error({ err }, 'checkout error');
    return reply.code(err.statusCode ?? 400).send({ error: err.message });
  }
});

fastify.post('/webhook', async (req, reply) => {
  if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  if (!sig) return reply.code(400).send({ error: 'Missing signature' });
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return reply.code(500).send({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    fastify.log.error({ err }, 'invalid webhook signature');
    return reply.code(400).send({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.clerkUserId;
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const plan = session.metadata?.plan;

        if (subscriptionId && userId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items?.data?.[0]?.price?.id;
          db.upsertSubscription({
            userId,
            stripeCustomerId: customerId,
            status: subscription.status,
            plan: planFromPriceId(priceId) ?? plan ?? null,
            currentPeriodEnd: safeMs(subscription.current_period_end),
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;

        let userId = subscription.metadata?.clerkUserId
          || db.getSubscriptionByCustomer(customerId)?.userId
          || null;

        if (userId) {
          const priceId = subscription.items?.data?.[0]?.price?.id;
          db.upsertSubscription({
            userId,
            stripeCustomerId: customerId,
            status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
            plan: planFromPriceId(priceId),
            currentPeriodEnd: safeMs(subscription.current_period_end),
          });
        }
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
          let userId = subscription.metadata?.clerkUserId
            || db.getSubscriptionByCustomer(customerId)?.userId
            || null;
          if (userId) {
            const priceId = subscription.items?.data?.[0]?.price?.id;
            db.upsertSubscription({
              userId,
              stripeCustomerId: customerId,
              status: subscription.status,
              plan: planFromPriceId(priceId),
              currentPeriodEnd: safeMs(subscription.current_period_end),
            });
          }
        }
        break;
      }
      default:
        // ignore other events
        break;
    }
  } catch (err) {
    fastify.log.error({ err, type: event.type }, 'webhook handler error');
  }

  return { received: true };
});

fastify.get('/subscription/:clerkUserId', async (req) => {
  const { clerkUserId } = req.params;
  const sub = db.getSubscription(clerkUserId);
  if (!sub) return { active: false, plan: null, status: null, currentPeriodEnd: null };
  return {
    active: isActiveStatus(sub.status),
    plan: sub.plan ?? null,
    status: sub.status ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
  };
});

// SSE proxy for subscribed users — backend holds the Anthropic key.
fastify.post('/chat', async (req, reply) => {
  let userId;
  try {
    userId = await verifyClerkToken(req.body?.token);
  } catch (err) {
    return reply.code(err.statusCode ?? 401).send({ error: err.message });
  }

  const sub = db.getSubscription(userId);
  if (!sub || !isActiveStatus(sub.status)) {
    return reply.code(403).send({ error: 'No active subscription' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return reply.code(500).send({ error: 'Server missing ANTHROPIC_API_KEY' });
  }

  const { messages, system, max_tokens, model } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return reply.code(400).send({ error: 'messages required' });
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders?.();

  function send(eventName, data) {
    reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let aborted = false;
  req.raw.on('close', () => {
    aborted = true;
  });

  try {
    const stream = anthropic.messages.stream({
      model: model ?? 'claude-sonnet-4-5',
      max_tokens: typeof max_tokens === 'number' ? max_tokens : 4096,
      system,
      messages,
    });

    stream.on('text', (delta) => {
      if (aborted) return;
      send('delta', { text: delta });
    });

    await stream.finalMessage();
    if (!aborted) send('done', {});
  } catch (err) {
    fastify.log.error({ err }, 'chat stream error');
    if (!aborted) send('error', { message: err?.message ?? 'Stream error' });
  } finally {
    reply.raw.end();
  }
});

// ---------- start ----------

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Guided backend listening at ${address}`);
});
