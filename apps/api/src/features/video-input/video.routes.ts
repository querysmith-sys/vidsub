import express from 'express';
import { handleVideoStorage } from './video.controller';

export const videoRouter = express.Router();

videoRouter.post('/upload/video', handleVideoStorage);