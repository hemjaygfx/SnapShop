
import { Router } from 'express';
import { listProducts, getCategories, getProductBySlug } from '../controllers/productController.js';

const router = Router();

router.get("/", listProducts);
router.get("/categories", getCategories);
router.get("/:slug", getProductBySlug);

export default router;
