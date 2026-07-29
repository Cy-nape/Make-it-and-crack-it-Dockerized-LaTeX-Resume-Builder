import { Router } from 'express';
import { compileLatex } from '../controllers/latex';

const router = Router();

router.post('/compile', compileLatex);

export default router;
