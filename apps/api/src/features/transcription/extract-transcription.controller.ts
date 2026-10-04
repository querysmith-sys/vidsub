import { Request, Response } from "express";
import { getFileStream } from "./transcription.service";
import { getAudioFromVideo } from "./transcription.service";
import { getTranslatedTranscription } from "./transcription.service";
import path from 'path';
import fs from 'fs';

const dirPath = 'D:/videsub-video';
const hardDrivePath = path.join(dirPath, 'tmp_video.mp4');
if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}
const dest = fs.createWriteStream(hardDrivePath);

export const extractTranscriptionFromVideo = async (req: Request, res: Response) => {
    // 1. get the video stream from google drive
    // 2. use ffmpeg get the audio mp3 and send it to groq
    // 3. grqo will give the translated transcription
    // 4. send it to next step muxing
    try {
        const fileId = req.query.fileId;
        if (!fileId) {
            return res.status(404).json({ error: true, message: "fileId not found." })
        }
        const filechunk = await getFileStream(fileId as string);
        if (!filechunk) {
            return res.status(404).json({ error: true, message: "failed to get chunk"})
        }
        filechunk.pipe(dest)
        dest.on('finish', async () => {
            console.log("video stream completed");
            const audioPath = await getAudioFromVideo();
            console.log("audio path: ", audioPath);
            const transcribeText = await getTranslatedTranscription(audioPath as string);
            console.log(transcribeText)
            res.status(200).json({ success: true, data: transcribeText })
        })
    } catch (error) {
        console.log("error occured in extractTranscriptionFromVideo: ", error);
        return res.status(500).json({ error: true, message: "Internal server error" })
    }

}