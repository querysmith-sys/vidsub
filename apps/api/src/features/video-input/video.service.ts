import dotenv from 'dotenv';
dotenv.config();
import { google } from 'googleapis';
import axios from 'axios';
import type { Readable } from 'node:stream';

const folderID = process.env.FOLDER_ID;
const YOUR_CLIENT_ID = process.env.YOUR_CLIENT_ID;
const YOUR_CLIENT_SECRET = process.env.YOUR_CLIENT_SECRET;
const STATIC_REDIRECT_URI = process.env.STATIC_REDIRECT_URI;
const YOUR_REFRESH_TOKEN = process.env.YOUR_REFRESH_TOKEN;

// console.log(folderID)

// 1. Initialize the OAuth2 Client
export const oauth2Client = new google.auth.OAuth2(
    YOUR_CLIENT_ID,
    YOUR_CLIENT_SECRET,
    STATIC_REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: YOUR_REFRESH_TOKEN
});

function getDriveError(error: unknown, operation: string): Error {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const code = error.code;
        const details = [status ? `HTTP ${status}` : undefined, code, error.message]
            .filter(Boolean)
            .join(', ');
        return new Error(`Google Drive ${operation} failed: ${details}`, { cause: error });
    }
    return error instanceof Error ? error : new Error(String(error));
}

export async function getResumeableUploadURL(file: { mimeType: string, fileSize: string, fileName: string }): Promise<string> {
    if (!folderID) {
        throw new Error("Google Drive folder is not configured.");
    }
    try {
        const { token: accessToken } = await oauth2Client.getAccessToken();
        if (!accessToken) {
            throw new Error("Unable to obtain Google Drive access token.");
        }
        const metadata: { name: string, mimeType: string, parents: string[] } = {
            name: file.fileName,
            mimeType: file.mimeType,
            parents: [folderID],
        }
        const res = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', JSON.stringify(metadata), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': file.mimeType,
                'X-Upload-Content-Length': file.fileSize,
            }
        })
        const uploadUrl: unknown = res.headers.location;
        if (typeof uploadUrl !== 'string' || uploadUrl.length === 0) {
            throw new Error("Google Drive did not return a resumable upload URL.");
        }
        return uploadUrl;
    } catch (error: unknown) {
        throw getDriveError(error, 'resumable upload session creation');
    }
}

export async function uploadVideoToDrive(
    file: { mimeType: string, fileSize: string, fileName: string },
    stream: Readable,
): Promise<string> {
    const uploadUrl = await getResumeableUploadURL(file);

    try {
        const response = await axios.put<{ id?: unknown }>(uploadUrl, stream, {
            headers: {
                'Content-Type': file.mimeType,
                'Content-Length': file.fileSize,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        if (typeof response.data.id !== 'string' || response.data.id.length === 0) {
            throw new Error('Google Drive did not return a video file ID.');
        }
        return response.data.id;
    } catch (error: unknown) {
        throw getDriveError(error, 'video upload');
    }
}