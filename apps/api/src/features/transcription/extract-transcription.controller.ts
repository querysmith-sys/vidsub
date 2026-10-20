import { Request, Response } from "express";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import {
    addSoftSubtitles,
    getAudioFromVideo,
    getFileStream,
    getTranslatedTranscription,
    getVideoStartTimeMs,
    writeSubtitles,
} from "./transcription.service";

const JOB_RETENTION_MS = 60 * 60 * 1000;

type TranscriptionJobStatus = "queued" | "processing" | "ready" | "failed";

interface TranscriptionJob {
    id: string;
    status: TranscriptionJobStatus;
    createdAt: string;
    updatedAt: string;
    workingDir?: string;
    outputPath?: string;
    error?: string;
    cleanupTimer?: NodeJS.Timeout;
}

const jobs = new Map<string, TranscriptionJob>();

const updateJob = (job: TranscriptionJob, status: TranscriptionJobStatus) => {
    job.status = status;
    job.updatedAt = new Date().toISOString();
}

const scheduleCleanup = (job: TranscriptionJob) => {
    job.cleanupTimer = setTimeout(() => {
        void (async () => {
            if (job.workingDir) {
                try {
                    await rm(job.workingDir, { recursive: true, force: true });
                } catch (error) {
                    console.error(`Unable to remove expired job directory "${job.workingDir}":`, error);
                }
            }
            jobs.delete(job.id);
        })();
    }, JOB_RETENTION_MS);
    job.cleanupTimer.unref();
}

const processTranscriptionJob = async (job: TranscriptionJob, fileId: string, fileExtension: ".mp4" | ".mkv") => {
    try {
        const fileStream = await getFileStream(fileId);
        if (!fileStream) {
            throw new Error("Unable to retrieve the video from Google Drive.");
        }

        const tempRoot = process.env.VIDEO_TEMP_DIR || path.join(tmpdir(), "videsub-video");
        await mkdir(tempRoot, { recursive: true });
        job.workingDir = await mkdtemp(path.join(tempRoot, "request-"));

        const videoPath = path.join(job.workingDir, `tmp_video${fileExtension}`);
        updateJob(job, "processing");
        await pipeline(fileStream, createWriteStream(videoPath));

        const audioPath = await getAudioFromVideo(videoPath);
        const videoStartTimeMs = await getVideoStartTimeMs(videoPath);
        const transcription = await getTranslatedTranscription(audioPath, videoStartTimeMs);
        const subtitlePath = path.join(job.workingDir, "subtitles.srt");
        const outputPath = path.join(job.workingDir, "translated_video.mp4");
        await writeSubtitles(subtitlePath, transcription);
        await addSoftSubtitles(videoPath, subtitlePath, outputPath);

        job.outputPath = outputPath;
        updateJob(job, "ready");
        scheduleCleanup(job);
    } catch (error) {
        console.error(`Transcription job "${job.id}" failed:`, error);
        job.error = error instanceof Error ? error.message : String(error);
        updateJob(job, "failed");

        if (job.workingDir) {
            try {
                await rm(job.workingDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Unable to remove failed job directory "${job.workingDir}":`, cleanupError);
            }
            job.workingDir = undefined;
        }
        scheduleCleanup(job);
    }
}

export const extractTranscriptionFromVideo = (req: Request, res: Response) => {
    const fileId = req.query.fileId;
    const requestedExtension = req.query.fileExtension ?? ".mp4";
    if (typeof fileId !== "string" || !fileId.trim()) {
        return res.status(400).json({ error: true, message: "fileId is required." });
    }
    if (requestedExtension !== ".mp4" && requestedExtension !== ".mkv") {
        return res.status(400).json({ error: true, message: "Only MP4 and MKV video files are supported." });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const job: TranscriptionJob = {
        id,
        status: "queued",
        createdAt: now,
        updatedAt: now,
    };
    jobs.set(id, job);

    void processTranscriptionJob(job, fileId, requestedExtension);

    return res.status(202).json({
        success: true,
        data: {
            jobId: id,
            status: job.status,
            statusUrl: `/api/transcription/jobs/${id}`,
            downloadUrl: `/api/transcription/jobs/${id}/download`,
        },
    });
}

export const getTranscriptionJob = (req: Request, res: Response) => {
    const jobId = req.params.jobId;
    if (typeof jobId !== "string") {
        return res.status(400).json({ error: true, message: "jobId is required." });
    }
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: true, message: "Transcription job not found or expired." });
    }

    return res.status(200).json({
        success: true,
        data: {
            jobId: job.id,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            ...(job.status === "ready" && {
                downloadUrl: `/api/transcription/jobs/${job.id}/download`,
            }),
            ...(job.error && { error: job.error }),
        },
    });
}

export const downloadTranscribedVideo = (req: Request, res: Response) => {
    const jobId = req.params.jobId;
    if (typeof jobId !== "string") {
        return res.status(400).json({ error: true, message: "jobId is required." });
    }
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: true, message: "Transcription job not found or expired." });
    }
    if (job.status !== "ready" || !job.outputPath) {
        return res.status(409).json({
            error: true,
            message: "The subtitled video is not ready yet.",
            status: job.status,
        });
    }

    res.setTimeout(0);
    return res.download(job.outputPath, "translated-video.mp4", (error) => {
        if (!error) return;
        const errorCode = "code" in error ? error.code : undefined;
        if (errorCode === "ECONNABORTED" || errorCode === "ECONNRESET") {
            console.warn(`Client disconnected while downloading transcription job "${job.id}". The file remains available for retry.`);
            return;
        }

        console.error(`Unable to send subtitled video for job "${job.id}":`, error);
        if (!res.headersSent && !res.destroyed) {
            res.status(500).json({ error: true, message: "Unable to download subtitled video." });
        }
    });
}
