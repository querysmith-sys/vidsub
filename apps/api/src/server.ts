import dotenv from 'dotenv';
dotenv.config()
import express from 'express';
import { videoRouter } from './features/video-input/video.routes';
import transcriptionRouter from './features/transcription/transcription.routes';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
    origin:'http://localhost:5173'
}))
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
    })
})
app.use('/api', videoRouter);
app.use('/api', transcriptionRouter);

app.listen(3000, () => {
    console.log("server started at 3000");
})