
import { Router } from 'express';

const router = Router();
 
router.get("/", (req, res, next ) => {
    try {
        const { userId, isAunthenticated } = getAuth(req);
        if (!isAunthenticated) {
            res.status(401).json({error: "Not authenticated"});
            return;
        }
        const user = await getLocalUser(userId);
        res.json({ user });


    } catch (error) {}

});


export default router;