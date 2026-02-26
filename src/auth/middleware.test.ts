import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from './middleware';
import type { Request, Response, NextFunction } from 'express';

function makeReq(userId?: number): Partial<Request> {
    return { session: { userId } as any };
}

function makeRes() {
    const res: any = {};
    res.redirect = vi.fn();
    return res as Response;
}

describe('requireAuth', () => {
    it('calls next() when session has userId', () => {
        const next = vi.fn();
        requireAuth(makeReq(1) as Request, makeRes(), next);
        expect(next).toHaveBeenCalledOnce();
    });

    it('redirects to /login when no userId in session', () => {
        const res = makeRes();
        const next = vi.fn();
        requireAuth(makeReq(undefined) as Request, res, next);
        expect(res.redirect).toHaveBeenCalledWith('/login');
        expect(next).not.toHaveBeenCalled();
    });
});
