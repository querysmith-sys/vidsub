import express from 'express';
// import multer from 'multer';
import { handleVideoStorage } from './video.controller';

export const videoRouter = express.Router();
// const upload = multer();

videoRouter.post('/upload/video', handleVideoStorage);