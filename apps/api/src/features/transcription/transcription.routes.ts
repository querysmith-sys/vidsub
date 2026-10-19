import express from 'express';
import {
    downloadTranscribedVideo,
    extractTranscriptionFromVideo,
    getTranscriptionJob,
} from './extract-transcription.controller';

const transcriptionRouter = express.Router();
transcriptionRouter.get('/transcription/extract', extractTranscriptionFromVideo);
transcriptionRouter.get('/transcription/jobs/:jobId', getTranscriptionJob);
transcriptionRouter.get('/transcription/jobs/:jobId/download', downloadTranscribedVideo);
export default transcriptionRouter;