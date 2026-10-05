import { Request, Response } from "express";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
    getAudioFromVideo,
    getFileStream,
    getTranslatedTranscription,
} from "./transcription.service";

export const extractTranscriptionFromVideo = async (req: Request, res: Response) => {
    let workingDir: string | undefined;

    try {
        const fileId = req.query.fileId;
        if (typeof fileId !== "string" || !fileId.trim()) {
            return res.status(404).json({ error: true, message: "fileId not found." });
        }

        const fileStream = await getFileStream(fileId);
        if (!fileStream) {
            return res.status(404).json({ error: true, message: "failed to get chunk" });
        }

        const tempRoot = process.env.VIDEO_TEMP_DIR || path.join(tmpdir(), "videsub-video");
        await mkdir(tempRoot, { recursive: true });
        workingDir = await mkdtemp(path.join(tempRoot, "request-"));

        const videoPath = path.join(workingDir, "tmp_video.mp4");
        await pipeline(fileStream, createWriteStream(videoPath));

        const audioPath = await getAudioFromVideo(videoPath);
        console.log("Audio extracted to:", audioPath);
        const transcription = await getTranslatedTranscription(audioPath);

        return res.status(200).json({ success: true, data: transcription });
    } catch (error) {
        console.error("Error occurred in extractTranscriptionFromVideo:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    } finally {
        // if (workingDir) {
        //     try {
        //         await rm(workingDir, { recursive: true, force: true });
        //     } catch (error) {
        //         console.error(`Unable to remove temporary directory "${workingDir}":`, error);
        //     }
        // }
        console.log("Temporary working directory cleanup skipped for debugging purposes.", workingDir);
    }
};
