import { confirmMockPayment, initializeMockPayment } from '../services/paymentService.js';

export async function initializeMock(req, res, next) {
  try { res.status(201).json(await initializeMockPayment(req.auth.userId, req.validatedBody.orderId)); } catch (error) { next(error); }
}

export async function confirmMock(req, res, next) {
  try { res.json(await confirmMockPayment(req.auth.userId, req.validatedBody)); } catch (error) { next(error); }
}
