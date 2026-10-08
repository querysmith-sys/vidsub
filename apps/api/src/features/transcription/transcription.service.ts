import axios from "axios"
import { oauth2Client } from "../video-input/video.service"
import ffmpeg from "fluent-ffmpeg"
import { AssemblyAI } from "assemblyai"
import path from "node:path"
import { access, stat } from "node:fs/promises";
import { GoogleGenAI } from '@google/genai';
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

const createInput = (transcript: any) => {
    const INPUT = {
        text: transcript.text,
        words: transcript.words.map(({ text, start, end }: { text: string; start: number; end: number }) => ({
            text,
            start,
            end
        }))
    }
    return INPUT;
}

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || ''
})
let USER_INSTRUCTION: any = null;
export const getTranslatedTranscription = async (path: string) => {
    //  use assembly api send the audio get english transcription
    // then use ffmpeg to add soft sub to video  and return a downloadable video
    try {
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
        USER_INSTRUCTION = createInput(transcript);
        console.log("USER_INSTRUCTION: ", USER_INSTRUCTION);
        const res = await translateTranscription(USER_INSTRUCTION);
        return res;
    }
    catch (error) {
        throw new Error(`Error in getTranslatedTranscription: ${error}`);
    }
}


const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
})




const translateTranscription = async (USER_INSTRUCTION: {text: string, words: []}) => {
const SYSTEM_PROMPT = `You are a translation system.
You will receive a JSON object containing subtitles.
Your ONLY task is to translate the value of each "text" field into English.
Rules:
Translate ONLY the "text" field.
Keep every other property exactly unchanged.
Do NOT change index.
Do NOT change start.
Do NOT change end.
Do NOT add or remove subtitle objects.
Do NOT merge or split subtitles.
Preserve the exact order of the subtitles.
Preserve the JSON structure.
Translate the complete meaning of each text naturally and accurately.
The source language can be ANY language.
Return ONLY the translated JSON.
No markdown.
No explanation.
No additional text.
INPUT:
${JSON.stringify(USER_INSTRUCTION)}
`
    console.log("SYSTEM_PROMPT: ", SYSTEM_PROMPT)
    const interaction = await ai.interactions.create({
        model: 'gemini-3.7-flash',
        input: SYSTEM_PROMPT
    })
    console.log("model output: ", interaction)
    return interaction.output_text;
}

// output:
// `{"text":"Hey, long time no see. Yeah, long time no see. Are you very busy? Very busy, what about you? I'm okay, not too busy.","words":[{"text":"Hey,","start":3540,"end":4140},{"text":"long time no see.","start":4140,"end":5180},{"text":"Yeah,","start":6940,"end":7340},{"text":"long time no see.","start":7340,"end":8460},{"text":"Are you","start":9880,"end":10140},{"text":"very","start":10140,"end":10320},{"text":"busy","start":10320,"end":10480},{"text":"?","start":10480,"end":11130},{"text":"Very","start":12800,"end":12960},{"text":"busy,","start":12960,"end":13600},{"text":"what about","start":13600,"end":13860},{"text":"you?","start":13860,"end":15460},{"text":"I'm","start":15980,"end":16200},{"text":"okay,","start":16200,"end":16820},{"text":"not too busy.","start":16820,"end":17480}]}