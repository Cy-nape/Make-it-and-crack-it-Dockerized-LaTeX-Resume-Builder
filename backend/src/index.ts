import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import latexRoutes from './routes/latex';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '10mb' }));


app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/latex', latexRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
