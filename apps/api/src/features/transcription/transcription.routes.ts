import express from 'express';
import { extractTranscriptionFromVideo } from './extract-transcription.controller';

const transcriptionRouter = express.Router();
transcriptionRouter.get('/transcription/extract', extractTranscriptionFromVideo);
export default transcriptionRouter;