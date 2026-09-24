
import { Router } from "express";
import {
  createCheckout,
  recoverByPolarCheckoutId,
} from "../controllers/checkoutController";

const router = Router();

router.post("/", createCheckout);
router.post("/recover-by-polar-id/:checkoutId", recoverByPolarCheckoutId);

export default router;