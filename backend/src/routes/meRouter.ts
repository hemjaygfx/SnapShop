
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getAuth } from "@clerk/express";
import { getLocalUser } from "../lib/users.js";

const router = Router();
 
router.get("/", async (req: Request, res: Response, _next: NextFunction) => {
    try {
        const { userId, isAuthenticated } = getAuth(req);
        if (!isAuthenticated || !userId) {
            res.status(401).json({error: "Not authenticated"});
            return;
        }
        const user = await getLocalUser(userId);
        if (!user) {
            res.status(503).json({ error: "Account not synced yet" });
            return;
        }
        res.json({ user });


    } catch (error) {
        console.error("meRouter error", error);
        res.status(500).json({ error: "Internal server error" });
    }

});


export default router;