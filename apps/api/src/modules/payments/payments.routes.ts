import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { IdParam } from '../../core/http.js';
import { logger } from '../../core/logger.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { applyPaymentResult } from './payments.service.js';
import { MANUAL_PROVIDER, getProvider } from './providers/index.js';
import { fakeBill, fakeMarkPaid, fakeSign } from './providers/fake.js';

export const paymentsRouter = Router();
const ProviderParam = z.object({ provider: z.enum(['billplz', 'fake']) });

/** Server-to-server callback from the gateway. The only way (with requery) a payment becomes PAID. */
paymentsRouter.post('/payments/webhook/:provider', express.urlencoded({ extended: false, limit: '50kb' }), async (req, res) => {
  const { provider: name } = ProviderParam.parse(req.params);
  const provider = getProvider(name);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = provider.verifyCallback(body);
  const log = await db().paymentWebhookLog.create({
    data: { provider: name, providerRef: result?.providerRef ?? (String(body.id ?? body.ref ?? '') || null), signatureValid: !!result, payload: body as Prisma.InputJsonValue },
  });
  if (!result) {
    logger.warn({ provider: name }, 'Rejected payment callback with an invalid signature');
    res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
    return;
  }
  try {
    const outcome = await applyPaymentResult(name, result, 'callback');
    await db().paymentWebhookLog.update({ where: { id: log.id }, data: { processedAt: new Date(), error: outcome === 'PAID' || outcome === 'ALREADY_PAID' || outcome === 'NOT_PAID' ? null : outcome } });
    res.json({ data: { outcome } });
  } catch (err) {
    await db().paymentWebhookLog.update({ where: { id: log.id }, data: { error: err instanceof Error ? err.message : String(err) } });
    throw err; // 500 makes the gateway retry
  }
});

/**
 * The customer's browser comes back here. The signed redirect is only a hint: we ask the gateway
 * directly before changing anything, then send the browser to the result page.
 */
paymentsRouter.get('/payments/return/:provider', async (req, res) => {
  const { provider: name } = ProviderParam.parse(req.params);
  const provider = getProvider(name);
  const hint = provider.verifyRedirect(req.query as Record<string, unknown>);
  let orderNo = '';
  if (hint) {
    const payment = await db().payment.findUnique({ where: { provider_providerRef: { provider: name, providerRef: hint.providerRef } }, include: { order: true } });
    orderNo = payment?.order.publicNo ?? '';
    if (payment && payment.status !== 'PAID' && hint.paid) {
      try {
        await applyPaymentResult(name, await provider.queryStatus(hint.providerRef), 'requery');
      } catch (err) {
        logger.warn({ err }, 'Requery on return failed; the callback or reconcile job will finish it');
      }
    }
  }
  res.redirect(303, `${env().APP_URL.replace(/\/$/, '')}/checkout/result${orderNo ? `?order=${encodeURIComponent(orderNo)}` : ''}`);
});

paymentsRouter.post('/admin/payments/:id/requery', requireAuth, requirePermission('admin.access', 'payments.manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const payment = await db().payment.findUnique({ where: { id } });
  if (!payment?.providerRef) throw new AppError('NOT_FOUND', 404, 'Payment not found or never reached the gateway');
  if (payment.provider === MANUAL_PROVIDER) throw new AppError('NOT_A_GATEWAY_PAYMENT', 409, 'This payment was recorded by an admin, not taken through a gateway');
  const result = await getProvider(payment.provider).queryStatus(payment.providerRef);
  const outcome = await applyPaymentResult(payment.provider, result, 'requery');
  await audit({ actorId: currentUser(req).id, action: 'payment.requeried', entityType: 'Payment', entityId: id, after: { outcome }, ip: requestIp(req) });
  res.json({ data: { outcome } });
});

/** Local test gateway pages. Mounted only when PAYMENT_PROVIDER=fake (never in production). */
export const fakeGatewayRouter = Router();

fakeGatewayRouter.get('/payments/fake/checkout/:ref', (req, res) => {
  const bill = fakeBill(req.params.ref);
  if (!bill) throw new AppError('NOT_FOUND', 404, 'Unknown test bill');
  const ref = encodeURIComponent(req.params.ref);
  res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test payment</title><body style="font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<h1>Test payment gateway</h1><p>This is a local test page. No real money moves.</p>
<p>Amount: <strong>RM ${(bill.amountSen / 100).toFixed(2)}</strong></p>
<form method="post" action="/api/v1/payments/fake/complete/${ref}"><input type="hidden" name="paid" value="true">
<button style="padding:12px 20px;font-size:16px">Pay successfully</button></form><br>
<form method="post" action="/api/v1/payments/fake/complete/${ref}"><input type="hidden" name="paid" value="false">
<button style="padding:12px 20px;font-size:16px">Fail payment</button></form></body>`);
});

fakeGatewayRouter.post('/payments/fake/complete/:ref', express.urlencoded({ extended: false }), async (req, res) => {
  const ref = req.params.ref;
  const paid = req.body?.paid === 'true';
  const bill = fakeMarkPaid(ref, paid);
  if (!bill) throw new AppError('NOT_FOUND', 404, 'Unknown test bill');
  const fields = { ref, paid: String(paid), amount: String(bill.amountSen), signature: fakeSign(ref, paid, bill.amountSen) };
  // Behave like a gateway: server callback first, then browser redirect.
  await fetch(bill.callbackUrl, { method: 'POST', body: new URLSearchParams(fields) }).catch((err) => logger.warn({ err }, 'Fake callback failed'));
  res.redirect(303, `${bill.redirectUrl}?${new URLSearchParams(fields)}`);
});
