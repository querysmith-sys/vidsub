import express from 'express';
import { videoRouter } from './features/video-input/video.routes';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
    })
})

app.use('/api', videoRouter);

app.listen(3000, () => {
    console.log("server started at 3000");
})