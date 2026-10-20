import { Request, Response } from "express"
import { uploadVideoToDrive } from "./video.service"

export const handleVideoStorage = async (req: Request, res: Response) => {
    const fileName = req.query.fileName;
    const requestMimeType = req.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const contentLength = req.get("content-length");

    if (typeof fileName !== "string" || fileName.trim().length === 0) {
        return res.status(400).json({ success: false, message: "A video file name is required." })
    }
    const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
    if (extension !== ".mp4" && extension !== ".mkv") {
        return res.status(415).json({ success: false, message: "Only MP4 and MKV video files are supported." })
    }
    const acceptedMimeTypes = extension === ".mkv"
        ? ["video/x-matroska", "video/mkv", "application/x-matroska", "application/octet-stream"]
        : ["video/mp4", "application/octet-stream"];
    if (!requestMimeType || !acceptedMimeTypes.includes(requestMimeType)) {
        return res.status(415).json({ success: false, message: "The uploaded file type does not match its file extension." })
    }
    if (!contentLength || !/^\d+$/u.test(contentLength) || !Number.isSafeInteger(Number(contentLength)) || Number(contentLength) <= 0) {
        return res.status(400).json({ success: false, message: "A valid video content length is required." })
    }

    try {
        const mimeType = extension === ".mkv" ? "video/x-matroska" : "video/mp4";
        const fileId = await uploadVideoToDrive({
            mimeType,
            fileSize: contentLength,
            fileName,
        }, req);
        return res.status(200).json({ success: true, fileId });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Video upload failed:", message);
        return res.status(502).json({ success: false, message: "Unable to upload video to Google Drive." })
    }
}
