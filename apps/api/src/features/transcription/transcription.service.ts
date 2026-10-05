import axios from "axios"
import { oauth2Client } from "../video-input/video.service"
import ffmpeg from "fluent-ffmpeg"
import { AssemblyAI } from "assemblyai"
import path from "node:path"
import { access, stat } from "node:fs/promises";
// ffmpeg.setFfmpegPath(ffmpegPath)
// ffmpeg.setFfprobePath(ffprobePath)


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

export const getAudioFromVideo = (videoPath: string) => {
    const outputPath = path.join(path.dirname(videoPath), 'audio.mp3');
    console.log("FFmpeg output path:", outputPath);
    return new Promise<string>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(new Error(`Unable to inspect video file "${videoPath}": ${err.message}`));
                return;
            }

            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            if (!audioStream) {
                reject(new Error(`Video file "${videoPath}" does not contain an audio stream`));
                return;
            }

            ffmpeg(videoPath)
                .noVideo()
                .audioCodec('libmp3lame')
                .format('mp3')
                .save(outputPath)
                .on("end", async () => {
                    try {
                        await access(outputPath);

                        const stats = await stat(outputPath);

                        console.log("FFmpeg finished.");
                        console.log("Audio exists:", outputPath);
                        console.log("Audio size:", stats.size, "bytes");

                        resolve(outputPath);
                    } catch (error) {
                        reject(
                            new Error(
                                `FFmpeg finished but audio file was not found: ${outputPath}`
                            )
                        );
                    }
                })
                .on('error', reject);
        });
    });

}

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || ''
})
export const getTranslatedTranscription = async (path: string) => {
    //  use assembly api send the audio get english transcription
    // then use ffmpeg to add soft sub to video  and return a downloadable video
    try {
        // const transcript = await client.transcripts.transcribe({
        //     audio: path,
        //     speech_understanding: {
        //         request: {
        //             translation: {
        //                 target_languages: ['en'],
        //                 formal: true
        //             }
        //         }
        //     }
        // });
        const transcript = await client.transcripts.transcribe({
            audio: path,
            speaker_labels: true, // Required for match_original_utterance
            speech_understanding: {
                request: {
                    translation: {
                        target_languages: ['en'],
                        formal: true,
                        match_original_utterance: true, // Adds translated_texts per utterance
                    },
                },
            },
        });

        // Each utterance now has its own translated text + existing start/end timestamps
        transcript.utterances?.forEach((utt) => {
            console.log(utt.start, utt.end, utt?.translated_texts?.en);
        });
        console.log(transcript);
        return transcript;
    }
    catch (error) {
        throw new Error(`Error in getTranslatedTranscription: ${error}`);
    }
}

const translateTranscription = () => {

}