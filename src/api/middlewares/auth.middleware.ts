import type { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';
import { JWT_PUBLIC_KEY } from "../config";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.headers['authorization'];

    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return; // ⬅️ stop execution without returning res
    }

    try {
        const decoded = jwt.verify(token, JWT_PUBLIC_KEY);
        if (!decoded || typeof decoded !== 'object' || !('sub' in decoded)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        req.userId = decoded.sub as string;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
