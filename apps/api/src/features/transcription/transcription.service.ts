import axios from "axios"
import { oauth2Client } from "../video-input/video.service"
import ffmpeg from "fluent-ffmpeg"
import { AssemblyAI } from "assemblyai"

export const getFileStream = async (fileId: string) => {
    try {
        const { token: accessToken } = await oauth2Client.getAccessToken();
        const streamResponse = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }, responseType: 'stream'
        })
        return streamResponse.data;
    } catch (error) {
        console.error('Error occured function(getFileStream): ', error);
        return undefined;
    }
}

export const getAudioFromVideo = () => {

    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe('D:/videsub-video/tmp_video.mp4', (err, metadata) => {
            if (err) {
                console.error('Error probing file:', err);
                return;
            }

            // Find the audio stream
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            const codec = audioStream ? audioStream.codec_name : '';

            let extension = '.m4a'; // Default
            if (codec === 'mp3') extension = '.mp3';
            if (codec === 'vorbis' || codec === 'opus') extension = '.ogg';

            const outputPath = `D:/videsub-video/output_audio${extension}`;
            // Now run the extraction with the correct extension
            ffmpeg('D:/videsub-video/tmp_video.mp4')
                .noVideo()
                .audioCodec('copy')
                .save(outputPath)
                .on('end', () => {
                    console.log("done");
                    resolve(outputPath)
                })
                .on('error', (error: any) => reject(error));
        });
    })

}

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || ''
})
export const getTranslatedTranscription = async (path: string) => {
    //  use assembly api send the audio get english transcription
    // then use ffmpeg to add soft sub to video  and return a downloadable video
    try {
        const result = await client.sync.transcribe(path);
        return result;
    }
    catch (error) {
        throw new Error(`Error in getTranslatedTranscription: ${error}`);
    }
}