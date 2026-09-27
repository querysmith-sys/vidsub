import { Request, Response } from "express"
import { getResumeableUploadURL } from "./video.service"

export const handleVideoStorage = async (req: Request, res: Response) => {
    try {
        const fileMetadata = req.body;
        console.log("metadata: ", fileMetadata);

        const uploadURL = await getResumeableUploadURL(fileMetadata);
        if (!uploadURL) {
            res.json({message: 'URL is Empty'});
            return;
        }
        res.status(200).json({success: true, url: uploadURL});
    } catch (error) {
        console.log('video input Error:', error);
    }
}

