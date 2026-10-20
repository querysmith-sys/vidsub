import axios from "axios"
import { oauth2Client } from "../video-input/video.service"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import { AssemblyAI } from "assemblyai"
import { GoogleGenAI } from "@google/genai"
import { createRequire } from "node:module"
import path from "node:path"
import { access, stat, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path: string };
const MAX_VIDEO_DURATION_SECONDS = 30 * 60;
const SUBTITLE_WORD_GAP_MS = 400;
const MAX_SUBTITLE_CUE_DURATION_MS = 6000;
const MAX_SUBTITLE_CUE_LENGTH = 84;
const MAX_SUBTITLE_LINE_LENGTH = 42;
const TRANSLATION_BATCH_SIZE = 50;
const SENTENCE_END_PATTERN = /[.!?。？！][\s"'’”)\]）】」』〕〉》]*$/u;

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
ffmpeg.setFfprobePath(ffprobeStatic.path);

interface TranscriptionWord {
    text: string;
    start: number;
    end: number;
}

interface TranslatedTranscription {
    text: string;
    words: TranscriptionWord[];
}

interface SubtitleCue extends TranscriptionWord {
    firstWordText: string;
    firstWordStartMs: number;
    sourceWordStarts: number[];
}

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

            const duration = metadata.format.duration;
            if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
                reject(new Error(`Unable to determine the duration of video "${videoPath}"`));
                return;
            }
            if (duration > MAX_VIDEO_DURATION_SECONDS) {
                reject(new Error("Video duration must be 30 minutes or less."));
                return;
            }

            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            if (!audioStream) {
                reject(new Error(`Video file "${videoPath}" does not contain an audio stream`));
                return;
            }
            if (!metadata.streams.some(s => s.codec_type === 'video')) {
                reject(new Error(`File "${videoPath}" does not contain a video stream`));
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

export const getVideoStartTimeMs = async (videoPath: string): Promise<number> => {
    return new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (error, metadata) => {
            if (error) {
                reject(new Error(`Unable to inspect video start time "${videoPath}": ${error.message}`));
                return;
            }

            const startTimeSeconds = metadata.format.start_time;
            if (typeof startTimeSeconds === "number" && Number.isFinite(startTimeSeconds)) {
                resolve(startTimeSeconds * 1000);
                return;
            }

            const streamStartTimes = metadata.streams
                .map((stream) => stream.start_time)
                .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
            resolve(streamStartTimes.length > 0 ? Math.min(...streamStartTimes) * 1000 : 0);
        });
    });
}

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || ''
})
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
})

export const getTranslatedTranscription = async (
    audioPath: string,
    timestampOffsetMs = 0
): Promise<TranslatedTranscription> => {
    try {
        const transcript = await client.transcripts.transcribe({
            audio: audioPath
        });

        if (!Number.isFinite(timestampOffsetMs)) {
            throw new Error("Subtitle timestamp offset must be a finite number of milliseconds.");
        }
        const sourceWords = transcript.words ?? [];
        if (sourceWords.length === 0) {
            throw new Error("Transcription returned no word-level timestamps.");
        }

        const cues = buildSubtitleCues(sourceWords.map(({ text, start, end }) => ({ text, start, end })));
        const firstTenCues = cues.slice(0, 10);
        firstTenCues.forEach((cue, index) => {
            console.debug(
                `Subtitle cue ${index + 1}: firstWord="${cue.firstWordText}" firstWordStartMs=${cue.firstWordStartMs} cueStartMs=${cue.start}`
            );
        });

        for (const cue of cues) {
            cue.start += timestampOffsetMs;
            cue.end += timestampOffsetMs;
        }

        const translatedTexts = await translateSubtitleCues(cues);
        const translatedCues = cues.map((cue, index) => ({
            text: translatedTexts[index],
            start: cue.start,
            end: cue.end
        }));

        return {
            text: translatedCues.map(cue => cue.text).join(" "),
            words: translatedCues
        };
    } catch (error) {
        throw new Error(
            `Error in getTranslatedTranscription: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const buildSubtitleCues = (sourceWords: TranscriptionWord[]): SubtitleCue[] => {
    const cues: SubtitleCue[] = [];
    let cueWords: TranscriptionWord[] = [];
    let cueText = "";
    let skippedWords = 0;
    let keptZeroDurationWords = 0;
    let previousValidWord: TranscriptionWord | undefined;

    const flushCue = () => {
        if (cueWords.length === 0) return;
        cues.push({
            text: cueText,
            start: cueWords[0].start,
            end: Math.max(
                cueWords[cueWords.length - 1].end,
                cueWords[cueWords.length - 1].start
            ),
            firstWordText: cueWords[0].text,
            firstWordStartMs: cueWords[0].start,
            sourceWordStarts: cueWords.map(word => word.start)
        });
        cueWords = [];
        cueText = "";
    };

    for (let index = 0; index < sourceWords.length; index += 1) {
        const word = sourceWords[index];
        const text = word.text.replace(/[\r\n]+/gu, " ").trim();
        if (!text) continue;

        const invalidStartOrEnd = !Number.isFinite(word.start) ||
            !Number.isFinite(word.end) ||
            word.start < 0;
        if (invalidStartOrEnd) {
            const punctuationOnly = /^\p{P}+$/u.test(text);
            const previousCue = cueWords.length > 0
                ? undefined
                : cues[cues.length - 1];
            const previousWord = cueWords[cueWords.length - 1] ??
                (previousCue ? {
                    text: previousCue.text,
                    start: previousCue.start,
                    end: previousCue.end
                } : undefined);

            if (punctuationOnly && previousWord) {
                previousWord.text += text;
                if (cueWords.length > 0) {
                    cueText += text;
                } else if (previousCue) {
                    previousCue.text += text;
                }
                continue;
            }

            skippedWords += 1;
            console.warn(
                `Skipping AssemblyAI word with invalid timing: ${JSON.stringify({
                    index,
                    text,
                    start: word.start,
                    end: word.end
                })}.`
            );
            continue;
        }

        if (previousValidWord && word.start < previousValidWord.start) {
            throw new Error(
                `AssemblyAI word timestamps are out of order at index ${index}: ` +
                `${JSON.stringify({ text, start: word.start, previousStart: previousValidWord.start })}.`
            );
        }
        const effectiveEnd = Math.max(word.end, word.start);
        if (word.end <= word.start) {
            keptZeroDurationWords += 1;
        }

        const previousWord = cueWords[cueWords.length - 1];
        const separator = /^[,.;:!?。？！、，；：]/u.test(text) ? "" : " ";
        const nextCueText = cueText ? `${cueText}${separator}${text}` : text;
        const shouldStartNewCue = cueWords.length > 0 && (
            word.start - Math.max(previousWord.end, previousWord.start) > SUBTITLE_WORD_GAP_MS ||
            SENTENCE_END_PATTERN.test(previousWord.text.trim()) ||
            effectiveEnd - cueWords[0].start > MAX_SUBTITLE_CUE_DURATION_MS ||
            nextCueText.length > MAX_SUBTITLE_CUE_LENGTH
        );
        if (shouldStartNewCue) {
            flushCue();
        }

        const keptWord = { text, start: word.start, end: effectiveEnd };
        cueWords.push(keptWord);
        previousValidWord = keptWord;
        cueText = cueText ? `${cueText}${separator}${text}` : text;
        if (SENTENCE_END_PATTERN.test(text)) {
            flushCue();
        }
    }
    flushCue();

    console.info(
        `Subtitle word timing summary: total words=${sourceWords.length}, skipped words=${skippedWords}, kept zero-duration words=${keptZeroDurationWords}.`
    );
    if (cues.length === 0) {
        throw new Error("Transcription returned no words with valid start/end timestamps.");
    }

    for (let index = 0; index < cues.length - 1; index += 1) {
        if (cues[index].end > cues[index + 1].start) {
            cues[index].end = cues[index + 1].start;
        }
    }

    return cues;
}

const translateSubtitleCues = async (cues: SubtitleCue[]): Promise<string[]> => {
    if (cues.length === 0) {
        throw new Error("No valid timed subtitle cues were created from the transcript.");
    }
    const translatedTexts: string[] = [];
    for (let offset = 0; offset < cues.length; offset += TRANSLATION_BATCH_SIZE) {
        const batch = cues.slice(offset, offset + TRANSLATION_BATCH_SIZE);
        const firstCueNumber = offset + 1;
        const lastCueNumber = offset + batch.length;
        const numberedLines = batch
            .map((cue, index) => `${firstCueNumber + index}. ${cue.text.replace(/[\r\n]+/gu, " ")}`)
            .join("\n");
        const prompt = `Translate each numbered subtitle line into natural English.
Keep the same numbering and the same number of lines.
Translate only the text after each number. Do not merge, split, omit, or reorder lines.
Preserve the meaning and punctuation. Return only numbered lines, one per input line.

${numberedLines}`;
        const interaction = await ai.interactions.create({
            model: "gemini-3.7-flash",
            input: prompt
        });
        const output = interaction.output_text?.trim();
        if (!output) {
            throw new Error(`Translation model returned no translations for subtitle cues ${firstCueNumber}-${lastCueNumber}.`);
        }

        const translations = new Map<number, string>();
        let currentNumber: number | undefined;
        for (const line of output
            .replace(/^```(?:text|txt)?\s*|\s*```$/g, "")
            .split(/\r?\n/u)) {
            const match = line.match(/^\s*(\d+)[.)\t:]\s*(.*)$/u);
            if (match) {
                currentNumber = Number(match[1]);
                if (currentNumber < firstCueNumber || currentNumber > lastCueNumber || translations.has(currentNumber)) {
                    throw new Error(`Translation model returned invalid or duplicate cue number ${currentNumber} for batch ${firstCueNumber}-${lastCueNumber}.`);
                }
                translations.set(currentNumber, match[2].trim());
            } else if (line.trim() && currentNumber !== undefined) {
                translations.set(currentNumber, `${translations.get(currentNumber)} ${line.trim()}`.trim());
            }
        }

        for (let cueNumber = firstCueNumber; cueNumber <= lastCueNumber; cueNumber += 1) {
            const translated = translations.get(cueNumber);
            if (!translated) {
                throw new Error(`Translation model omitted subtitle cue ${cueNumber} in batch ${firstCueNumber}-${lastCueNumber}.`);
            }
            translatedTexts.push(translated);
        }
    }
    return translatedTexts;
}
const formatSrtTimestamp = (milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error(`Cannot format invalid SRT timestamp "${milliseconds}".`);
    }
    const totalMilliseconds = Math.ceil(milliseconds);
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
    const fraction = totalMilliseconds % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(fraction).padStart(3, "0")}`;
}

const wrapSubtitleText = (text: string) => {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(/\s+/u)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (line && candidate.length > MAX_SUBTITLE_LINE_LENGTH) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines.join("\n");
}

export const createSrt = (transcription: TranslatedTranscription) => {
    return transcription.words
        .map((cue, index) => `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${wrapSubtitleText(cue.text)}`)
        .join("\n\n") + "\n";
}

export const writeSubtitles = async (subtitlePath: string, transcription: TranslatedTranscription) => {
    await writeFile(subtitlePath, createSrt(transcription), "utf8");
}

export const addSoftSubtitles = async (
    videoPath: string,
    subtitlePath: string,
    outputPath: string
) => {
    await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
            .input(subtitlePath)
            .outputOptions([
                "-map 0:v:0",
                "-map 0:a?",
                "-map 1:0",
                "-c:v copy",
                "-c:a copy",
                "-c:s mov_text",
                "-metadata:s:s:0 language=eng",
                "-metadata:s:s:0 title=English",
                "-disposition:s:0 default",
                "-movflags +faststart"
            ])
            .format("mp4")
            .save(outputPath)
            .on("end", () => resolve())
            .on("error", reject);
    });

    await access(outputPath);
    const outputStats = await stat(outputPath);
    if (outputStats.size === 0) {
        throw new Error("FFmpeg produced an empty subtitled video.");
    }
}
