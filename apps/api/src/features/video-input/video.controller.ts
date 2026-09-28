import { Request, Response } from "express"
import { getResumeableUploadURL } from "./video.service"

export const handleVideoStorage = async (req: Request, res: Response) => {
    try {
        const fileMetadata = req.body;
        if (!fileMetadata) {
            return res.status(400).json({ eror: true, message: "fields are empty" })
        }

        const uploadURL = await getResumeableUploadURL(fileMetadata);
        if (!uploadURL) {
            res.status(404).json({ error: true,  message: 'URL is Empty' });
            return;
        }
        res.status(200).json({ success: true, url: uploadURL });
    } catch (error) {
        console.log('video input Error:', error);
    }
}

